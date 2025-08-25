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

// ==================== 常量定义 ====================
const API_BASE_URL = 'https://cursor.com/api';
const DOUBLE_CLICK_DELAY = 300;
const API_TIMEOUT = 5000;
const MAX_RETRY_COUNT = 3;
const RETRY_DELAY = 1000;

// ==================== 工具函数 ====================
function logWithTime(message: string): void {
  const timestamp = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  console.log(`[${timestamp}] ${message}`);
}

function formatTimestamp(timestamp: number): string {
  return new Date(Number(timestamp)).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function formatTokensInMillions(tokens: number): string {
  const millions = tokens / 1000000;
  return `${millions.toFixed(2)}M`;
}

// ==================== 浏览器检测 ====================
type BrowserType = 'chrome' | 'edge' | 'unknown';

async function detectDefaultBrowser(): Promise<BrowserType> {
  const platform = os.platform();
  
  try {
    const command = getBrowserDetectionCommand(platform);
    if (!command) return 'unknown';
    
    return new Promise((resolve) => {
      cp.exec(command, (error, stdout) => {
        if (error) {
          logWithTime(`检测浏览器失败: ${error.message}`);
          resolve('unknown');
          return;
        }
        
        const browserType = parseBrowserOutput(stdout.toLowerCase());
        resolve(browserType);
      });
    });
  } catch (error) {
    logWithTime(`检测浏览器异常: ${error}`);
    return 'unknown';
  }
}

function getBrowserDetectionCommand(platform: string): string | null {
  switch (platform) {
    case 'win32':
      return `reg query "HKEY_CURRENT_USER\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice" /v ProgId`;
    case 'darwin':
      return 'defaults read com.apple.LaunchServices/com.apple.launchservices.secure LSHandlers | grep -A 2 -B 2 "LSHandlerURLScheme.*http"';
    case 'linux':
      return 'xdg-settings get default-web-browser';
    default:
      return null;
  }
}

function parseBrowserOutput(output: string): BrowserType {
  if (output.includes('chrome')) return 'chrome';
  if (output.includes('edge') || output.includes('msedge')) return 'edge';
  return 'unknown';
}

function getBrowserExtensionUrl(browserType: BrowserType): string {
  return browserType === 'edge' 
    ? 'https://microsoftedge.microsoft.com/addons/detail/hgabfbdfbpplaoakjkclmijoegfgcdli'
    : 'https://chromewebstore.google.com/detail/cursor-session-token-extr/pchppfhkjloedakahedjknknjppjpple';
}


// ==================== 主类 ====================
class CursorUsageProvider {
  private membershipData: MembershipResponse | null = null;
  private billingCycleData: BillingCycleResponse | null = null;
  private usageData: UsageResponse | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private clickTimer: NodeJS.Timeout | null = null;
  private statusBarItem: vscode.StatusBarItem;
  private clickCount = 0;
  private isRefreshing = false;
  private isManualRefresh = false;

  constructor(private context: vscode.ExtensionContext) {
    this.statusBarItem = this.createStatusBarItem();
    this.initialize();
  }

  private createStatusBarItem(): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    item.command = 'cursorUsage.handleStatusBarClick';
    item.show();
    return item;
  }

  private initialize(): void {
    const sessionToken = this.getSessionToken();

    if (sessionToken) {
      this.isRefreshing = true;
      this.setLoadingState();
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
      }, DOUBLE_CLICK_DELAY);
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
    this.setLoadingState();
    this.fetchData();
  }

  private setLoadingState(): void {
    this.statusBarItem.text = "⚡ Refreshing...";
    this.statusBarItem.tooltip = "Refreshing Cursor usage data...";
    this.statusBarItem.color = undefined;
  }

  // ==================== 状态栏更新 ====================
  private updateStatusBar(): void {
    const sessionToken = this.getSessionToken();
    if (!sessionToken) {
      this.showNotConfiguredStatus();
      return;
    }

    if (!this.usageData || !this.membershipData || !this.billingCycleData) {
      // If session token exists but data is invalid, do nothing.
      // This preserves the 'Refreshing...' or previous state.
      return;
    }

    this.showUsageStatus();
  }

  private showNotConfiguredStatus(): void {
    this.statusBarItem.text = "⚡ Not Configured";
    this.statusBarItem.color = undefined;
    this.statusBarItem.tooltip = "Click to configure Cursor session token\n\nSingle click: Refresh\nDouble click: Configure";
  }

  private showUsageStatus(): void {
    if (!this.usageData || !this.membershipData) {
      return;
    }
    
    const totalCost = this.usageData.totalCostCents / 100;
    const membershipType = this.membershipData.membershipType.toUpperCase();
    
    // 根据会员类型显示不同信息
    if (membershipType === 'PRO' || membershipType === 'ULTRA') {
      const maxAmount = membershipType === 'PRO' ? 20 : 400;
      const percentage = Math.min((totalCost / maxAmount) * 100, 100);
      this.statusBarItem.text = `⚡ ${membershipType}: $${totalCost.toFixed(2)} (${percentage.toFixed(1)}%)`;
    } else {
      this.statusBarItem.text = `⚡ ${membershipType}: $${totalCost.toFixed(2)}`;
    }
    
    this.statusBarItem.color = undefined;
    this.statusBarItem.tooltip = this.buildDetailedTooltip();
  }

  // ==================== Tooltip 构建 ====================
  private buildDetailedTooltip(): string {
    if (!this.usageData || !this.membershipData || !this.billingCycleData) {
      return "⚡ Cursor Usage Summary\n" +
             "━".repeat(30) + "\n" +
             "Click to configure session token\n\n" +
             "💡 Usage Tips:\n" +
             "• Single click to refresh\n" +
             "• Double click to configure";
    }

    const sections: string[] = [
      "⚡ Cursor Usage Summary",
      "━".repeat(30)
    ];

    // Billing period (简化显示)
    const startDate = formatTimestamp(Number(this.billingCycleData.startDateEpochMillis));
    const endDate = formatTimestamp(Number(this.billingCycleData.endDateEpochMillis));
    sections.push(`📅 ${startDate} - ${endDate}`);

    // Membership info (简化显示)
    const membershipType = this.membershipData.membershipType.toUpperCase();
    sections.push(`👤 ${membershipType} | ${this.membershipData.subscriptionStatus}`, "");

    // Model usage details (简化只显示Total Tokens和Cost)
    sections.push("🤖 Model Usage:");
    this.usageData.aggregations.forEach(agg => {
      const modelName = agg.modelIntent;
      const totalTokens = Number(agg.inputTokens || 0) + Number(agg.outputTokens) + 
                         Number(agg.cacheWriteTokens) + Number(agg.cacheReadTokens);
      const cost = agg.totalCents / 100;

      sections.push(
        `• ${modelName}: ${formatTokensInMillions(totalTokens)} tokens | $${cost.toFixed(2)}`
      );
    });
    sections.push("");

    // Total summary (简化显示)
    const totalCost = this.usageData.totalCostCents / 100;
    const totalTokens = Number(this.usageData.totalInputTokens) + 
                       Number(this.usageData.totalOutputTokens) + 
                       Number(this.usageData.totalCacheReadTokens);
    
    sections.push(
      `📊 Total: ${formatTokensInMillions(totalTokens)} Cost: $${totalCost.toFixed(2)}`,
      ""
    );

    sections.push(
      "━".repeat(30),
      "💡 Tips: Single click refresh | Double click configure"
    );
    
    return sections.join("\n");
  }

  // ==================== API 调用 ====================
  async fetchData(retryCount = 0): Promise<void> {
    try {
      const sessionToken = this.getSessionToken();
      if (!sessionToken) {
        this.handleNoSessionToken();
        return;
      }

      // 1. 获取会员信息
      await this.fetchMembershipData(sessionToken, retryCount);
      
      // 2. 获取账单周期
      await this.fetchBillingCycle(sessionToken, retryCount);
      
      // 3. 获取使用量数据
      if (this.billingCycleData) {
        await this.fetchUsageData(sessionToken, this.billingCycleData, retryCount);
      }

      this.updateStatusBar();
      this.resetRefreshState();
    } catch (error) {
      this.handleFetchError(error, retryCount);
    }
  }

  private async fetchMembershipData(sessionToken: string, retryCount = 0): Promise<void> {
    try {
      const response = await axios.get<MembershipResponse>(
        `${API_BASE_URL}/auth/stripe`,
        {
          headers: {
            'Cookie': `WorkosCursorSessionToken=${sessionToken}`,
            'Content-Type': 'application/json',
            'Origin': 'https://cursor.com',
            'Referer': 'https://cursor.com/dashboard'
          },
          timeout: API_TIMEOUT
        }
      );

      logWithTime('获取会员信息成功');
      this.membershipData = response.data;
    } catch (error) {
      logWithTime(`获取会员信息失败: ${error}`);
      throw error;
    }
  }

  private async fetchBillingCycle(sessionToken: string, retryCount = 0): Promise<void> {
    try {
      const response = await axios.post<BillingCycleResponse>(
        `${API_BASE_URL}/dashboard/get-current-billing-cycle`,
        {},
        {
          headers: {
            'Cookie': `WorkosCursorSessionToken=${sessionToken}`,
            'Content-Type': 'application/json',
            'Origin': 'https://cursor.com',
            'Referer': 'https://cursor.com/dashboard'
          },
          timeout: API_TIMEOUT
        }
      );

      logWithTime('获取账单周期成功');
      this.billingCycleData = response.data;
    } catch (error) {
      logWithTime(`获取账单周期失败: ${error}`);
      throw error;
    }
  }

  private async fetchUsageData(sessionToken: string, billingCycle: BillingCycleResponse, retryCount = 0): Promise<void> {
    try {
      const response = await axios.post<UsageResponse>(
        `${API_BASE_URL}/dashboard/get-aggregated-usage-events`,
        {
          teamId: -1,
          startDate: Number(billingCycle.startDateEpochMillis),
          endDate: Number(billingCycle.endDateEpochMillis)
        },
        {
          headers: {
            'Cookie': `WorkosCursorSessionToken=${sessionToken}`,
            'Content-Type': 'application/json',
            'Origin': 'https://cursor.com',
            'Referer': 'https://cursor.com/dashboard?tab=usage'
          },
          timeout: API_TIMEOUT
        }
      );

      logWithTime('获取使用量数据成功');
      this.usageData = response.data;
    } catch (error) {
      logWithTime(`获取使用量数据失败: ${error}`);
      throw error;
    }
  }

  private getSessionToken(): string | undefined {
    const config = vscode.workspace.getConfiguration('cursorUsage');
    return config.get<string>('sessionToken');
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
    logWithTime(`获取数据失败 (尝试 ${retryCount + 1}/${MAX_RETRY_COUNT}): ${error}`);
    
    if (this.isManualRefresh) {
      if (this.isRetryableError(error)) {
        vscode.window.showErrorMessage('Network is unstable. Please try again later.');
      } else {
        this.showFetchErrorMessage(error);
      }
      this.resetRefreshState();
      this.updateStatusBar();
      return;
    }
    
    if (retryCount < MAX_RETRY_COUNT) {
      this.scheduleRetry(retryCount);
    } else {
      logWithTime('API调用失败，已达到最大重试次数，停止重试');
    }
  }

  private scheduleRetry(retryCount: number): void {
    logWithTime(`API调用失败，将在1秒后进行第${retryCount + 1}次重试`);
    this.retryTimer = setTimeout(() => {
      this.fetchData(retryCount + 1);
    }, RETRY_DELAY);
  }

  private isRetryableError(error: any): boolean {
    return error && (
      error.code === 'ECONNABORTED' || 
      error.message?.includes('timeout') ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNRESET'
    );
  }

  // ==================== 消息显示 ====================
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

  private showFetchErrorMessage(error: any): void {
    vscode.window.showErrorMessage(
      `Failed to get usage data: ${error?.toString() || 'Unknown error'}`
    );
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
        logWithTime('自动刷新');
        this.isRefreshing = true;
        this.fetchData();
      }
    }, intervalMilliseconds);
    
    logWithTime(`自动刷新已设置，间隔: ${intervalSeconds}秒`);
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
    this.statusBarItem.dispose();
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
      logWithTime(`Clipboard check failed: ${error}`);
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
  logWithTime('Cursor Usage Monitor extension is now active.');
  
  const provider = new CursorUsageProvider(context);
  const clipboardMonitor = new ClipboardMonitor();

  // 注册命令
  registerCommands(context, provider);
  
  // 注册监听器
  registerListeners(context, clipboardMonitor);
  
  // 确保扩展停用时释放资源
  context.subscriptions.push({
    dispose: () => {
      provider.dispose();
    }
  });
}

function registerCommands(context: vscode.ExtensionContext, provider: CursorUsageProvider): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('cursorUsage.refresh', () => {
      provider.refresh();
    }),
    
    vscode.commands.registerCommand('cursorUsage.handleStatusBarClick', () => {
      provider.handleStatusBarClick();
    }),
    
    vscode.commands.registerCommand('cursorUsage.updateSession', async () => {
      await showUpdateSessionDialog();
    })
  );
}

function registerListeners(context: vscode.ExtensionContext, clipboardMonitor: ClipboardMonitor): void {
  // 监听窗口状态
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState(async (e) => {
      if (e.focused) {
        setTimeout(() => clipboardMonitor.checkForToken(), 500);
      }
    }),
    // 监听配置变更
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('cursorUsage.refreshInterval')) {
        // The provider itself listens for this, so we don't need to do anything here
        // but we could if we wanted to.
      }
    })
  );
}

async function showUpdateSessionDialog(): Promise<void> {
  const defaultBrowser = await detectDefaultBrowser();
  logWithTime(`Detected default browser for session update: ${defaultBrowser}`);
  
  const extensionUrl = getBrowserExtensionUrl(defaultBrowser);
  
  const choice = await vscode.window.showInformationMessage(
    'To get your session token, you can visit the official Cursor dashboard. You can also use a browser extension to easily copy the token.',
    'Visit Cursor Dashboard',
    'Install Browser Extension'
  );
  
  if (choice === 'Visit Cursor Dashboard') {
    vscode.env.openExternal(vscode.Uri.parse('https://cursor.com/dashboard?tab=usage'));
  } else if (choice === 'Install Browser Extension') {
    vscode.env.openExternal(vscode.Uri.parse(extensionUrl));
  }
}


export function deactivate() {
  logWithTime('Cursor Usage Monitor extension is now deactivated.');
}