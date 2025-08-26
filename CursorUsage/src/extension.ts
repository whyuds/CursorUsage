import * as vscode from 'vscode';
import * as os from 'os';
import * as cp from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import axios from 'axios';
import * as chokidar from 'chokidar';

// ==================== 类型定义 ====================
interface BillingCycleResponse {
  startDateEpochMillis: string;
  endDateEpochMillis: string;
}

interface MembershipResponse {
  membershipType: string;
  paymentId: string;
  subscriptionStatus: string;
  verifiedStudent: boolean;
  trialEligible: boolean;
  isOnStudentPlan: boolean;
  customerBalance: number;
  trialWasCancelled: boolean;
  isTeamMember: boolean;
  teamMembershipType: string | null;
  individualMembershipType: string;
}

interface ModelAggregation {
  modelIntent: string;
  inputTokens?: string;
  outputTokens: string;
  cacheWriteTokens: string;
  cacheReadTokens: string;
  totalCents: number;
}

interface UsageResponse {
  aggregations: ModelAggregation[];
  totalInputTokens: string;
  totalOutputTokens: string;
  totalCacheWriteTokens: string;
  totalCacheReadTokens: string;
  totalCostCents: number;
}

// 新增：实时消费监控相关类型
interface UsageEventResponse {
  totalUsageEventsCount: number;
  usageEventsDisplay: UsageEvent[];
}

interface UsageEvent {
  timestamp: string;
  model: string;
  kind: string;
  requestsCosts: number;
  usageBasedCosts: string;
  isTokenBasedCall: boolean;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
    totalCents: number;
  };
  owningUser: string;
}

interface ComposerData {
  allComposers: Array<{
    type: string;
    composerId: string;
    createdAt: number;
    unifiedMode: string;
    forceMode: string;
    hasUnreadMessages: boolean;
    lastUpdatedAt?: number;
    name?: string;
  }>;
  selectedComposerIds: string[];
  hasMigratedComposerData: boolean;
  hasMigratedMultipleComposers: boolean;
}

type BrowserType = 'chrome' | 'edge' | 'unknown';

// ==================== 常量定义 ====================
const CONFIG = {
  API_BASE_URL: 'https://cursor.com/api',
  DOUBLE_CLICK_DELAY: 300,
  API_TIMEOUT: 5000,
  MAX_RETRY_COUNT: 3,
  RETRY_DELAY: 1000,
  MEMBERSHIP_LIMITS: { PRO: 20, ULTRA: 400 }
} as const;

const BROWSER_URLS = {
  edge: 'https://microsoftedge.microsoft.com/addons/detail/hgabfbdfbpplaoakjkclmijoegfgcdli',
  chrome: 'https://chromewebstore.google.com/detail/cursor-session-token-extr/pchppfhkjloedakahedjknknjppjpple'
} as const;

// ==================== 工具函数 ====================
class Utils {
  static logWithTime(message: string): void {
    const timestamp = new Date().toLocaleString('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    console.log(`[${timestamp}] ${message}`);
  }

  static formatTimestamp(timestamp: number): string {
    return new Date(Number(timestamp)).toLocaleString('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
  }

  static formatTokensInMillions(tokens: number): string {
    return `${(tokens / 1000000).toFixed(2)}M`;
  }

  static isRetryableError(error: any): boolean {
    return error && (
      error.code === 'ECONNABORTED' || 
      error.message?.includes('timeout') ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNRESET'
    );
  }

  static getSessionToken(): string | undefined {
    return vscode.workspace.getConfiguration('cursorUsage').get<string>('sessionToken');
  }
}

// 新增：工作区ID计算工具类
class WorkspaceIdCalculator {
  /**
   * 根据工作区路径和创建时间计算唯一ID
   * 模拟git-bash中的计算方式
   */
  static async calculateWorkspaceId(workspaceDir: string): Promise<string | null> {
    try {
      Utils.logWithTime(`计算工作区ID: ${workspaceDir}`);
      
      // 检查工作区目录是否存在
      if (!await fs.pathExists(workspaceDir)) {
        Utils.logWithTime(`工作区目录不存在: ${workspaceDir}`);
        return null;
      }

      // 获取文件统计信息
      const stats = await fs.stat(workspaceDir);
      
      // 获取创建时间（毫秒时间戳）
      const ctime = stats.birthtimeMs || stats.ctimeMs;
      Utils.logWithTime(`工作区创建时间: ${ctime}`);
      
      // 将驱动器字母转为小写（模拟bash中的${WORKSPACE_DIR,}）
      const normalizedPath = workspaceDir.replace(/^([A-Z]):/, (match, letter) => letter.toLowerCase() + ':');
      
      // 拼接字符串：路径 + 时间戳
      const hashInput = normalizedPath + Math.floor(ctime).toString();
      Utils.logWithTime(`Hash输入: ${hashInput}`);
      
      // 计算MD5
      const hash = crypto.createHash('md5').update(hashInput, 'utf8').digest('hex');
      
      // 移除最后3个字符（模拟bash中的${HASH_DETAILS::-3}）
      const workspaceId = hash.slice(0, -3);
      
      Utils.logWithTime(`计算出的工作区ID: ${workspaceId}`);
      return workspaceId;
      
    } catch (error) {
      Utils.logWithTime(`计算工作区ID失败: ${error}`);
      return null;
    }
  }

  /**
   * 获取Cursor工作区存储目录路径
   */
  static getCursorWorkspaceStoragePath(workspaceId: string): string {
    const userDataPath = os.homedir();
    return path.join(userDataPath, 'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage', workspaceId);
  }

  /**
   * 获取state.vscdb文件路径
   */
  static getStateDbPath(workspaceId: string): string {
    const workspaceStoragePath = this.getCursorWorkspaceStoragePath(workspaceId);
    return path.join(workspaceStoragePath, 'state.vscdb');
  }
}

// ==================== 简化的SQLite数据读取类 ====================
class CursorDbMonitor {
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    Utils.logWithTime(`初始化CursorDbMonitor, 数据库路径: ${dbPath}`);
  }

  /**
   * 连接到SQLite数据库 (简化版，只检查文件存在)
   */
  async connect(): Promise<boolean> {
    try {
      if (!await fs.pathExists(this.dbPath)) {
        Utils.logWithTime(`数据库文件不存在: ${this.dbPath}`);
        return false;
      }
      Utils.logWithTime(`数据库文件检查成功: ${this.dbPath}`);
      return true;
    } catch (error) {
      Utils.logWithTime(`检查数据库文件失败: ${error}`);
      return false;
    }
  }

  /**
   * 读取composer.composerData数据 (简化版，使用文本搜索)
   */
  async getComposerData(): Promise<ComposerData | null> {
    try {
      // 读取整个文件内容
      const fileBuffer = await fs.readFile(this.dbPath);
      const fileContent = fileBuffer.toString('utf8', 0, Math.min(fileBuffer.length, 1024 * 1024)); // 只读取前1MB
      
      // 查找composer.composerData关键字
      const keyPattern = 'composer.composerData';
      const keyIndex = fileContent.indexOf(keyPattern);
      
      if (keyIndex === -1) {
        Utils.logWithTime('composer.composerData关键字未找到');
        return null;
      }
      
      // 查找JSON数据开始位置
      const jsonStartPattern = '{"allComposers":';
      const jsonStartIndex = fileContent.indexOf(jsonStartPattern, keyIndex);
      
      if (jsonStartIndex === -1) {
        Utils.logWithTime('JSON数据开始位置未找到');
        return null;
      }
      
      // 查找JSON数据结束位置 (简单的括号匹配)
      let braceCount = 0;
      let jsonEndIndex = jsonStartIndex;
      
      for (let i = jsonStartIndex; i < fileContent.length; i++) {
        const char = fileContent[i];
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            jsonEndIndex = i + 1;
            break;
          }
        }
      }
      
      if (braceCount !== 0) {
        Utils.logWithTime('JSON数据结束位置未找到');
        return null;
      }
      
      // 提取JSON字符串
      const jsonString = fileContent.substring(jsonStartIndex, jsonEndIndex);
      
      // 解析JSON
      const jsonData = JSON.parse(jsonString);
      Utils.logWithTime(`获取到composer数据: ${jsonData.allComposers?.length || 0} 个对话`);
      
      return jsonData as ComposerData;
      
    } catch (error) {
      Utils.logWithTime(`读取composer数据失败: ${error}`);
      return null;
    }
  }

  /**
   * 关闭数据库连接 (简化版，无需操作)
   */
  close(): void {
    Utils.logWithTime('数据库连接已关闭 (简化模式)');
  }

  /**
   * 检查数据库文件是否存在
   */
  async exists(): Promise<boolean> {
    return await fs.pathExists(this.dbPath);
  }
}

// ==================== 浏览器检测 ====================
class BrowserDetector {
  static async detectDefaultBrowser(): Promise<BrowserType> {
    const platform = os.platform();
    
    try {
      const command = this.getBrowserDetectionCommand(platform);
      if (!command) return 'unknown';
      
      return new Promise((resolve) => {
        cp.exec(command, (error, stdout) => {
          if (error) {
            Utils.logWithTime(`检测浏览器失败: ${error.message}`);
            resolve('unknown');
            return;
          }
          
          const browserType = this.parseBrowserOutput(stdout.toLowerCase());
          resolve(browserType);
        });
      });
    } catch (error) {
      Utils.logWithTime(`检测浏览器异常: ${error}`);
      return 'unknown';
    }
  }

  private static getBrowserDetectionCommand(platform: string): string | null {
    const commands = {
      win32: `reg query "HKEY_CURRENT_USER\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice" /v ProgId`,
      darwin: 'defaults read com.apple.LaunchServices/com.apple.launchservices.secure LSHandlers | grep -A 2 -B 2 "LSHandlerURLScheme.*http"',
      linux: 'xdg-settings get default-web-browser'
    };
    return commands[platform as keyof typeof commands] || null;
  }

  private static parseBrowserOutput(output: string): BrowserType {
    if (output.includes('chrome')) return 'chrome';
    if (output.includes('edge') || output.includes('msedge')) return 'edge';
    return 'unknown';
  }

  static getBrowserExtensionUrl(browserType: BrowserType): string {
    return browserType === 'edge' ? BROWSER_URLS.edge : BROWSER_URLS.chrome;
  }
}

// ==================== API 服务 ====================
class CursorApiService {
  private static createHeaders(sessionToken: string, referer: string = 'https://cursor.com/dashboard') {
    return {
      'Cookie': `WorkosCursorSessionToken=${sessionToken}`,
      'Content-Type': 'application/json',
      'Origin': 'https://cursor.com',
      'Referer': referer
    };
  }

  static async fetchMembershipData(sessionToken: string): Promise<MembershipResponse> {
    const response = await axios.get<MembershipResponse>(
      `${CONFIG.API_BASE_URL}/auth/stripe`,
      {
        headers: this.createHeaders(sessionToken),
        timeout: CONFIG.API_TIMEOUT
      }
    );
    Utils.logWithTime('获取会员信息成功');
    return response.data;
  }

  static async fetchBillingCycle(sessionToken: string): Promise<BillingCycleResponse> {
    const response = await axios.post<BillingCycleResponse>(
      `${CONFIG.API_BASE_URL}/dashboard/get-current-billing-cycle`,
      {},
      {
        headers: this.createHeaders(sessionToken),
        timeout: CONFIG.API_TIMEOUT
      }
    );
    Utils.logWithTime('获取账单周期成功');
    return response.data;
  }

  static async fetchUsageData(
    sessionToken: string, 
    billingCycle: BillingCycleResponse
  ): Promise<UsageResponse> {
    const response = await axios.post<UsageResponse>(
      `${CONFIG.API_BASE_URL}/dashboard/get-aggregated-usage-events`,
      {
        teamId: -1,
        startDate: Number(billingCycle.startDateEpochMillis),
        endDate: Number(billingCycle.endDateEpochMillis)
      },
      {
        headers: this.createHeaders(sessionToken, 'https://cursor.com/dashboard?tab=usage'),
        timeout: CONFIG.API_TIMEOUT
      }
    );
    Utils.logWithTime('获取使用量数据成功');
    return response.data;
  }

  /**
   * 新增：获取每日详细使用量事件
   * 查询当天零点到晚23:59:59的使用量详情
   */
  static async fetchDailyUsageEvents(sessionToken: string, targetDate?: Date): Promise<UsageEventResponse> {
    const date = targetDate || new Date();
    
    // 计算当天的开始和结束时间戳（毫秒）
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const startDate = startOfDay.getTime().toString();
    const endDate = endOfDay.getTime().toString();
    
    Utils.logWithTime(`查询日期: ${Utils.formatTimestamp(startOfDay.getTime())} - ${Utils.formatTimestamp(endOfDay.getTime())}`);
    
    const response = await axios.post<UsageEventResponse>(
      `${CONFIG.API_BASE_URL}/dashboard/get-filtered-usage-events`,
      {
        teamId: 0,
        startDate: startDate,
        endDate: endDate,
        page: 1,
        pageSize: 100
      },
      {
        headers: this.createHeaders(sessionToken, 'https://cursor.com/dashboard?tab=usage'),
        timeout: CONFIG.API_TIMEOUT
      }
    );
    
    Utils.logWithTime(`获取当日使用量事件成功: ${response.data.totalUsageEventsCount} 条记录`);
    return response.data;
  }
}

// ==================== 实时消费监控类 ====================
class RealtimeUsageMonitor {
  private fileWatcher: chokidar.FSWatcher | null = null;
  private dbMonitor: CursorDbMonitor | null = null;
  private lastComposerData: ComposerData | null = null;
  private recentUsageEvents: UsageEvent[] = [];
  private statusBarManager: StatusBarManager;
  private workspaceId: string | null = null;
  private stateDbPath: string | null = null;

  constructor(statusBarManager: StatusBarManager) {
    this.statusBarManager = statusBarManager;
    Utils.logWithTime('初始化实时消费监控器');
  }

  /**
   * 启动监控
   */
  async start(): Promise<boolean> {
    try {
      // 1. 计算工作区ID
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        Utils.logWithTime('未检测到工作区文件夹，无法启动实时监控');
        return false;
      }

      const workspacePath = workspaceFolders[0].uri.fsPath;
      this.workspaceId = await WorkspaceIdCalculator.calculateWorkspaceId(workspacePath);
      
      if (!this.workspaceId) {
        Utils.logWithTime('计算工作区ID失败，无法启动实时监控');
        return false;
      }

      // 2. 获取state.vscdb路径
      this.stateDbPath = WorkspaceIdCalculator.getStateDbPath(this.workspaceId);
      Utils.logWithTime(`state.vscdb路径: ${this.stateDbPath}`);

      // 3. 初始化数据库监控器
      this.dbMonitor = new CursorDbMonitor(this.stateDbPath);
      
      // 4. 读取初始数据
      await this.loadInitialData();

      // 5. 启动文件监控
      await this.startFileWatcher();

      Utils.logWithTime('实时消费监控器启动成功');
      return true;
      
    } catch (error) {
      Utils.logWithTime(`启动实时监控器失败: ${error}`);
      return false;
    }
  }

  /**
   * 加载初始数据
   */
  private async loadInitialData(): Promise<void> {
    if (!this.dbMonitor) return;

    try {
      if (await this.dbMonitor.exists()) {
        await this.dbMonitor.connect();
        this.lastComposerData = await this.dbMonitor.getComposerData();
        if (this.lastComposerData) {
          Utils.logWithTime(`加载初始对话数据: ${this.lastComposerData.allComposers.length} 个对话`);
        }
        this.dbMonitor.close();
      }
    } catch (error) {
      Utils.logWithTime(`加载初始数据失败: ${error}`);
    }
  }

  /**
   * 启动文件监控
   */
  private async startFileWatcher(): Promise<void> {
    if (!this.stateDbPath) return;

    try {
      // 使用chokidar监控文件变化
      this.fileWatcher = chokidar.watch(this.stateDbPath, {
        persistent: true,
        ignoreInitial: true,
        usePolling: false, // 使用系统事件，非轮询
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 100
        }
      });

      this.fileWatcher.on('change', () => {
        Utils.logWithTime('state.vscdb文件发生变化，开始检查对话数据');
        // 延迟100ms再检查，确保文件写入完成
        setTimeout(() => {
          this.checkComposerDataChanges();
        }, 100);
      });

      this.fileWatcher.on('error', (error) => {
        Utils.logWithTime(`文件监控错误: ${error}`);
      });

      Utils.logWithTime(`文件监控器启动成功: ${this.stateDbPath}`);
      
    } catch (error) {
      Utils.logWithTime(`启动文件监控器失败: ${error}`);
    }
  }

  /**
   * 检查对话数据变化
   */
  private async checkComposerDataChanges(): Promise<void> {
    if (!this.dbMonitor) return;

    try {
      // 重新连接数据库并读取数据
      await this.dbMonitor.connect();
      const currentComposerData = await this.dbMonitor.getComposerData();
      this.dbMonitor.close();

      if (!currentComposerData) {
        Utils.logWithTime('未能读取当前对话数据');
        return;
      }

      // 检查是否有lastUpdatedAt的更新
      const updatedComposers = this.findUpdatedComposers(currentComposerData);
      
      if (updatedComposers.length > 0) {
        Utils.logWithTime(`检测到${updatedComposers.length}个对话有更新`);
        
        // 更新本地缓存
        this.lastComposerData = currentComposerData;
        
        // 延迟1秒后查询API
        setTimeout(() => {
          this.queryLatestUsageEvents();
        }, 1000);
      }
      
    } catch (error) {
      Utils.logWithTime(`检查对话数据变化失败: ${error}`);
    }
  }

  /**
   * 查找更新的对话
   */
  private findUpdatedComposers(currentData: ComposerData): Array<any> {
    if (!this.lastComposerData) {
      // 第一次检查，返回空数组
      return [];
    }

    const updatedComposers = [];
    
    for (const currentComposer of currentData.allComposers) {
      if (!currentComposer.lastUpdatedAt) continue;
      
      const lastComposer = this.lastComposerData.allComposers.find(
        comp => comp.composerId === currentComposer.composerId
      );
      
      if (!lastComposer || 
          !lastComposer.lastUpdatedAt || 
          currentComposer.lastUpdatedAt > lastComposer.lastUpdatedAt) {
        updatedComposers.push(currentComposer);
        Utils.logWithTime(`对话 ${currentComposer.composerId} (${currentComposer.name || 'Unnamed'}) 有更新: ${Utils.formatTimestamp(currentComposer.lastUpdatedAt)}`);
      }
    }
    
    return updatedComposers;
  }

  /**
   * 查询最新的使用量事件
   */
  private async queryLatestUsageEvents(): Promise<void> {
    try {
      const sessionToken = Utils.getSessionToken();
      if (!sessionToken) {
        Utils.logWithTime('未配置会话令牌，无法查询使用量事件');
        return;
      }

      Utils.logWithTime('开始查询最新的使用量事件');
      const usageEvents = await CursorApiService.fetchDailyUsageEvents(sessionToken);
      
      if (usageEvents.usageEventsDisplay.length > 0) {
        // 获取最新的事件
        const latestEvent = usageEvents.usageEventsDisplay[0];
        
        // 检查是否是新的事件
        if (this.isNewUsageEvent(latestEvent)) {
          Utils.logWithTime(`检测到新的消费事件: $${(latestEvent.tokenUsage.totalCents / 100).toFixed(2)}/${latestEvent.model}`);
          
          // 更新最近事件缓存
          this.addToRecentEvents(latestEvent);
          
          // 显示实时消费提示
          this.showRealtimeUsageAlert(latestEvent);
        }
      }
      
    } catch (error) {
      Utils.logWithTime(`查询使用量事件失败: ${error}`);
    }
  }

  /**
   * 检查是否是新的使用量事件
   */
  private isNewUsageEvent(event: UsageEvent): boolean {
    // 检查是否已经存在于最近事件中
    return !this.recentUsageEvents.some(recentEvent => 
      recentEvent.timestamp === event.timestamp &&
      recentEvent.model === event.model &&
      recentEvent.tokenUsage.totalCents === event.tokenUsage.totalCents
    );
  }

  /**
   * 添加到最近事件缓存
   */
  private addToRecentEvents(event: UsageEvent): void {
    this.recentUsageEvents.unshift(event);
    // 只保留最近的3条记录
    if (this.recentUsageEvents.length > 3) {
      this.recentUsageEvents = this.recentUsageEvents.slice(0, 3);
    }
  }

  /**
   * 显示实时消费提示
   */
  private showRealtimeUsageAlert(event: UsageEvent): void {
    const cost = (event.tokenUsage.totalCents / 100).toFixed(2);
    const alertText = `-$${cost}/${event.model}`;
    
    Utils.logWithTime(`显示实时消费提示: ${alertText}`);
    
    // 设置高亮状态栏
    this.statusBarManager.showRealtimeAlert(alertText);
    
    // 2秒后恢复正常状态
    setTimeout(() => {
      this.statusBarManager.clearRealtimeAlert();
      // 同时触发整体消费情况的更新
      vscode.commands.executeCommand('cursorUsage.refresh');
    }, 2000);
  }

  /**
   * 获取最近的消费记录（用于Tooltip）
   */
  getRecentUsageEvents(): UsageEvent[] {
    return this.recentUsageEvents;
  }

  /**
   * 停止监控
   */
  stop(): void {
    try {
      if (this.fileWatcher) {
        this.fileWatcher.close();
        this.fileWatcher = null;
        Utils.logWithTime('文件监控器已停止');
      }
      
      if (this.dbMonitor) {
        this.dbMonitor.close();
        this.dbMonitor = null;
      }
      
      Utils.logWithTime('实时消费监控器已停止');
    } catch (error) {
      Utils.logWithTime(`停止实时监控器失败: ${error}`);
    }
  }
}

// ==================== 状态栏管理器 ====================
class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private realtimeMonitor: any | null = null; // 使用any避免循环引用
  private isShowingAlert = false;
  private originalText = '';
  private originalTooltip = '';

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.command = 'cursorUsage.handleStatusBarClick';
    this.statusBarItem.show();
  }

  /**
   * 设置实时监控器引用
   */
  setRealtimeMonitor(monitor: any): void {
    this.realtimeMonitor = monitor;
  }

  setLoading(): void {
    this.statusBarItem.text = "⚡ Refreshing...";
    this.statusBarItem.tooltip = "Refreshing Cursor usage data...";
    this.statusBarItem.color = undefined;
  }

  setNotConfigured(): void {
    this.statusBarItem.text = "⚡ Not Configured";
    this.statusBarItem.color = undefined;
    this.statusBarItem.tooltip = "Click to configure Cursor session token\n\nSingle click: Refresh\nDouble click: Configure";
  }

  setUsageData(
    usageData: UsageResponse, 
    membershipData: MembershipResponse, 
    billingCycleData: BillingCycleResponse
  ): void {
    const totalCost = usageData.totalCostCents / 100;
    const membershipType = membershipData.membershipType.toUpperCase();
    
    // 设置状态栏文本
    if (membershipType === 'PRO' || membershipType === 'ULTRA') {
      const maxAmount = CONFIG.MEMBERSHIP_LIMITS[membershipType as keyof typeof CONFIG.MEMBERSHIP_LIMITS];
      const percentage = Math.min((totalCost / maxAmount) * 100, 100);
      this.originalText = `⚡ ${membershipType}: $${totalCost.toFixed(2)} (${percentage.toFixed(1)}%)`;
    } else {
      this.originalText = `⚡ ${membershipType}: $${totalCost.toFixed(2)}`;
    }
    
    // 如果不在显示实时提示，就更新文本
    if (!this.isShowingAlert) {
      this.statusBarItem.text = this.originalText;
    }
    
    this.statusBarItem.color = undefined;
    this.originalTooltip = this.buildDetailedTooltip(usageData, membershipData, billingCycleData);
    
    // 如果不在显示实时提示，就更新Tooltip
    if (!this.isShowingAlert) {
      this.statusBarItem.tooltip = this.originalTooltip;
    }
  }

  /**
   * 显示实时消费提示
   */
  showRealtimeAlert(alertText: string): void {
    this.isShowingAlert = true;
    this.statusBarItem.text = `⚡ ${alertText}`;
    this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningBackground');
    
    // 更新Tooltip以包含实时信息
    const realtimeTooltip = this.buildRealtimeTooltip(alertText);
    this.statusBarItem.tooltip = realtimeTooltip;
  }

  /**
   * 清除实时提示
   */
  clearRealtimeAlert(): void {
    this.isShowingAlert = false;
    this.statusBarItem.text = this.originalText;
    this.statusBarItem.tooltip = this.originalTooltip;
    this.statusBarItem.color = undefined;
  }

  private buildDetailedTooltip(
    usageData: UsageResponse, 
    membershipData: MembershipResponse, 
    billingCycleData: BillingCycleResponse
  ): string {
    const sections = [
      "⚡ Cursor Usage Summary",
      "━".repeat(30),
      // 账单周期
      `📅 ${Utils.formatTimestamp(Number(billingCycleData.startDateEpochMillis))} - ${Utils.formatTimestamp(Number(billingCycleData.endDateEpochMillis))}`,
      // 会员信息
      `👤 ${membershipData.membershipType.toUpperCase()} | ${membershipData.subscriptionStatus}`,
      "",
      // 模型使用详情
      "🤖 Model Usage:"
    ];

    // 添加每个模型的使用情况
    usageData.aggregations.forEach(agg => {
      const totalTokens = Number(agg.inputTokens || 0) + Number(agg.outputTokens) + 
                         Number(agg.cacheWriteTokens) + Number(agg.cacheReadTokens);
      const cost = agg.totalCents / 100;
      sections.push(`• ${agg.modelIntent}: ${Utils.formatTokensInMillions(totalTokens)} tokens | $${cost.toFixed(2)}`);
    });

    // 总计
    const totalCost = usageData.totalCostCents / 100;
    const totalTokens = Number(usageData.totalInputTokens) + 
                       Number(usageData.totalOutputTokens) + 
                       Number(usageData.totalCacheReadTokens);
    
    sections.push(
      "",
      `📊 Total: ${Utils.formatTokensInMillions(totalTokens)} Cost: $${totalCost.toFixed(2)}`
    );

    // 添加最近的消费记录
    if (this.realtimeMonitor) {
      const recentEvents = this.realtimeMonitor.getRecentUsageEvents();
      if (recentEvents.length > 0) {
        sections.push(
          "",
          "📈 Recent Usage Events:"
        );
        
        recentEvents.forEach((event: UsageEvent, index: number) => {
          const cost = (event.tokenUsage.totalCents / 100).toFixed(2);
          const time = new Date(Number(event.timestamp)).toLocaleTimeString('en-US', {
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit'
          });
          const inputTokens = Utils.formatTokensInMillions(event.tokenUsage.inputTokens);
          const outputTokens = Utils.formatTokensInMillions(event.tokenUsage.outputTokens);
          
          sections.push(`${index + 1}. [${time}] ${event.model}: $${cost} (In: ${inputTokens}, Out: ${outputTokens})`);
        });
      }
    }
    
    sections.push(
      "",
      "━".repeat(30),
      "💡 Tips: Single click refresh | Double click configure"
    );
    
    return sections.join("\n");
  }

  /**
   * 构建实时提示Tooltip
   */
  private buildRealtimeTooltip(alertText: string): string {
    const sections = [
      "⚡ Real-time Usage Alert",
      "━".repeat(30),
      `💰 New Usage: ${alertText}`,
      ""
    ];

    // 添加最近的消费记录
    if (this.realtimeMonitor) {
      const recentEvents = this.realtimeMonitor.getRecentUsageEvents();
      if (recentEvents.length > 0) {
        sections.push(
          "📈 Recent Usage Events:"
        );
        
        recentEvents.forEach((event: UsageEvent, index: number) => {
          const cost = (event.tokenUsage.totalCents / 100).toFixed(2);
          const time = new Date(Number(event.timestamp)).toLocaleTimeString('en-US', {
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit'
          });
          const inputTokens = Utils.formatTokensInMillions(event.tokenUsage.inputTokens);
          const outputTokens = Utils.formatTokensInMillions(event.tokenUsage.outputTokens);
          
          sections.push(`${index + 1}. [${time}] ${event.model}: $${cost} (In: ${inputTokens}, Out: ${outputTokens})`);
        });
      }
    }
    
    sections.push(
      "",
      "━".repeat(30),
      "ℹ️ This alert will disappear in 2 seconds"
    );
    
    return sections.join("\n");
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}

// ==================== 主类 ====================
class CursorUsageProvider {
  private membershipData: MembershipResponse | null = null;
  private billingCycleData: BillingCycleResponse | null = null;
  private usageData: UsageResponse | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private clickTimer: NodeJS.Timeout | null = null;
  private statusBarManager: StatusBarManager;
  private realtimeMonitor: RealtimeUsageMonitor; // 新增：实时监控器
  private clickCount = 0;
  private isRefreshing = false;
  private isManualRefresh = false;

  constructor(private context: vscode.ExtensionContext) {
    this.statusBarManager = new StatusBarManager();
    this.realtimeMonitor = new RealtimeUsageMonitor(this.statusBarManager);
    
    // 设置状态栏管理器对实时监控器的引用
    this.statusBarManager.setRealtimeMonitor(this.realtimeMonitor);
    
    this.initialize();
  }

  private initialize(): void {
    const sessionToken = Utils.getSessionToken();

    if (sessionToken) {
      this.isRefreshing = true;
      this.statusBarManager.setLoading();
    } else {
      this.updateStatusBar();
    }

    this.startAutoRefresh();
    this.fetchData();
    
    // 新增：启动实时监控
    this.startRealtimeMonitoring();
  }

  /**
   * 新增：启动实时监控
   */
  private async startRealtimeMonitoring(): Promise<void> {
    try {
      Utils.logWithTime('尝试启动实时消费监控...');
      const success = await this.realtimeMonitor.start();
      if (success) {
        Utils.logWithTime('实时消费监控启动成功');
      } else {
        Utils.logWithTime('实时消费监控启动失败，但不影响基本功能');
      }
    } catch (error) {
      Utils.logWithTime(`启动实时监控异常: ${error}，继续使用基本功能`);
      // 不抛出错误，让基本功能继续工作
    }
  }

  // ==================== 点击处理 ====================
  handleStatusBarClick(): void {
    if (this.isRefreshing) return;
    
    this.clickCount++;
    
    if (this.clickTimer) {
      // 双击：打开设置
      this.clearClickTimer();
      vscode.commands.executeCommand('cursorUsage.updateSession');
    } else {
      // 单击：设置定时器
      this.clickTimer = setTimeout(() => {
        if (this.clickCount === 1) {
          this.refresh();
        }
        this.clearClickTimer();
      }, CONFIG.DOUBLE_CLICK_DELAY);
    }
  }

  private clearClickTimer(): void {
    if (this.clickTimer) {
      clearTimeout(this.clickTimer);
      this.clickTimer = null;
    }
    this.clickCount = 0;
  }

  // ==================== 刷新逻辑 ====================
  refresh(): void {
    this.isManualRefresh = true;
    this.isRefreshing = true;
    this.statusBarManager.setLoading();
    this.fetchData();
  }

  private updateStatusBar(): void {
    const sessionToken = Utils.getSessionToken();
    if (!sessionToken) {
      this.statusBarManager.setNotConfigured();
      return;
    }

    if (!this.usageData || !this.membershipData || !this.billingCycleData) {
      return;
    }

    this.statusBarManager.setUsageData(this.usageData, this.membershipData, this.billingCycleData);
  }

  // ==================== API 调用 ====================
  async fetchData(retryCount = 0): Promise<void> {
    try {
      const sessionToken = Utils.getSessionToken();
      if (!sessionToken) {
        this.handleNoSessionToken();
        return;
      }

      // 并行获取会员信息和账单周期
      const [membershipData, billingCycleData] = await Promise.all([
        CursorApiService.fetchMembershipData(sessionToken),
        CursorApiService.fetchBillingCycle(sessionToken)
      ]);

      this.membershipData = membershipData;
      this.billingCycleData = billingCycleData;

      // 获取使用量数据
      this.usageData = await CursorApiService.fetchUsageData(sessionToken, billingCycleData);

      this.updateStatusBar();
      this.resetRefreshState();
    } catch (error) {
      this.handleFetchError(error, retryCount);
    }
  }

  private resetRefreshState(): void {
    this.isManualRefresh = false;
    this.isRefreshing = false;
  }

  // ==================== 错误处理 ====================
  private handleNoSessionToken(): void {
    if (this.isManualRefresh) {
      this.showSetSessionMessage();
      this.resetRefreshState();
      this.updateStatusBar();
    }
    this.isManualRefresh = false;
  }

  private handleFetchError(error: any, retryCount: number): void {
    Utils.logWithTime(`获取数据失败 (尝试 ${retryCount + 1}/${CONFIG.MAX_RETRY_COUNT}): ${error}`);
    
    if (this.isManualRefresh) {
      const message = Utils.isRetryableError(error) 
        ? 'Network is unstable. Please try again later.'
        : `Failed to get usage data: ${error?.toString() || 'Unknown error'}`;
      
      vscode.window.showErrorMessage(message);
      this.resetRefreshState();
      this.updateStatusBar();
      return;
    }
    
    if (retryCount < CONFIG.MAX_RETRY_COUNT) {
      this.scheduleRetry(retryCount);
    } else {
      Utils.logWithTime('API调用失败，已达到最大重试次数，停止重试');
    }
  }

  private scheduleRetry(retryCount: number): void {
    Utils.logWithTime(`API调用失败，将在1秒后进行第${retryCount + 1}次重试`);
    this.retryTimer = setTimeout(() => {
      this.fetchData(retryCount + 1);
    }, CONFIG.RETRY_DELAY);
  }

  private showSetSessionMessage(): void {
    vscode.window.showWarningMessage(
      'Please set your Cursor session token.', 
      'Set Token'
    ).then(selection => {
      if (selection === 'Set Token') {
        vscode.commands.executeCommand('cursorUsage.updateSession');
      }
    });
  }

  // ==================== 自动刷新 ====================
  public startAutoRefresh(): void {
    const config = vscode.workspace.getConfiguration('cursorUsage');
    const intervalSeconds = config.get<number>('refreshInterval', 300);
    const intervalMilliseconds = intervalSeconds * 1000;
    
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    
    this.refreshTimer = setInterval(() => {
      if (!this.isRefreshing) {
        Utils.logWithTime('自动刷新');
        this.isRefreshing = true;
        this.fetchData();
      }
    }, intervalMilliseconds);
    
    Utils.logWithTime(`自动刷新已设置，间隔: ${intervalSeconds}秒`);
  }

  public stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  public dispose(): void {
    this.stopAutoRefresh();
    this.statusBarManager.dispose();
    
    // 新增：停止实时监控
    if (this.realtimeMonitor) {
      this.realtimeMonitor.stop();
    }
  }
}

// ==================== 剪贴板监控 ====================
class ClipboardMonitor {
  private lastNotifiedToken: string | null = null;

  async checkForToken(): Promise<void> {
    try {
      const clipboardText = await vscode.env.clipboard.readText();
      const tokenMatch = clipboardText.match(/WorkosCursorSessionToken=([^\n\s;]+)/);
      
      if (tokenMatch?.[1]) {
        await this.handleTokenDetected(tokenMatch[1]);
      }
    } catch (error) {
      Utils.logWithTime(`Clipboard check failed: ${error}`);
    }
  }

  private async handleTokenDetected(token: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('cursorUsage');
    const currentToken = config.get<string>('sessionToken');
    
    if (token !== currentToken) {
      await this.promptUpdateToken(token, config);
      this.lastNotifiedToken = null;
    } else if (this.lastNotifiedToken !== token) {
      vscode.window.showInformationMessage(`Cursor session token already configured.`);
      this.lastNotifiedToken = token;
    }
  }

  private async promptUpdateToken(token: string, config: vscode.WorkspaceConfiguration): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
      `Found Cursor session token in clipboard. Update configuration?`,
      'Update',
      'Cancel'
    );
    
    if (choice === 'Update') {
      await config.update('sessionToken', token, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage('Cursor session token updated automatically.');
      vscode.commands.executeCommand('cursorUsage.refresh');
    }
  }
}

// ==================== 扩展激活/停用 ====================
export function activate(context: vscode.ExtensionContext) {
  Utils.logWithTime('Cursor Usage Monitor extension is now active.');
  
  const provider = new CursorUsageProvider(context);
  const clipboardMonitor = new ClipboardMonitor();

  // 注册命令
  const commands = [
    vscode.commands.registerCommand('cursorUsage.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('cursorUsage.handleStatusBarClick', () => provider.handleStatusBarClick()),
    vscode.commands.registerCommand('cursorUsage.updateSession', showUpdateSessionDialog)
  ];

  // 注册监听器
  const listeners = [
    vscode.window.onDidChangeWindowState(async (e) => {
      if (e.focused) {
        setTimeout(() => clipboardMonitor.checkForToken(), 500);
      }
    })
  ];

  context.subscriptions.push(...commands, ...listeners, {
    dispose: () => provider.dispose()
  });
}

async function showUpdateSessionDialog(): Promise<void> {
  const defaultBrowser = await BrowserDetector.detectDefaultBrowser();
  Utils.logWithTime(`Detected default browser for session update: ${defaultBrowser}`);
  
  const extensionUrl = BrowserDetector.getBrowserExtensionUrl(defaultBrowser);
  
  const choice = await vscode.window.showInformationMessage(
    'To get your session token, you can visit the official Cursor dashboard. You can also use a browser extension to easily copy the token.',
    'Visit Cursor Dashboard',
    'Install Browser Extension'
  );
  
  const urls = {
    'Visit Cursor Dashboard': 'https://cursor.com/dashboard?tab=usage',
    'Install Browser Extension': extensionUrl
  };
  
  if (choice && urls[choice as keyof typeof urls]) {
    vscode.env.openExternal(vscode.Uri.parse(urls[choice as keyof typeof urls]));
  }
}

export function deactivate() {
  Utils.logWithTime('Cursor Usage Monitor extension is now deactivated.');
}
