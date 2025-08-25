import * as vscode from 'vscode';
import * as os from 'os';
import * as cp from 'child_process';
import axios from 'axios';

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
}

// ==================== 状态栏管理器 ====================
class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.command = 'cursorUsage.handleStatusBarClick';
    this.statusBarItem.show();
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
      this.statusBarItem.text = `⚡ ${membershipType}: $${totalCost.toFixed(2)} (${percentage.toFixed(1)}%)`;
    } else {
      this.statusBarItem.text = `⚡ ${membershipType}: $${totalCost.toFixed(2)}`;
    }
    
    this.statusBarItem.color = undefined;
    this.statusBarItem.tooltip = this.buildDetailedTooltip(usageData, membershipData, billingCycleData);
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
      `📊 Total: ${Utils.formatTokensInMillions(totalTokens)} Cost: $${totalCost.toFixed(2)}`,
      "",
      "━".repeat(30),
      "💡 Tips: Single click refresh | Double click configure"
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
  private clickCount = 0;
  private isRefreshing = false;
  private isManualRefresh = false;

  constructor(private context: vscode.ExtensionContext) {
    this.statusBarManager = new StatusBarManager();
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
