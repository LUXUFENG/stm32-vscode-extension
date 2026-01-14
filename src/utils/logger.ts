import * as vscode from 'vscode';

/**
 * 日志级别
 */
export enum LogLevel {
    INFO = 'INFO',
    SUCCESS = 'SUCCESS',
    WARNING = 'WARNING',
    ERROR = 'ERROR',
    DEBUG = 'DEBUG'
}

/**
 * 日志图标
 */
const LOG_ICONS: Record<LogLevel, string> = {
    [LogLevel.INFO]: 'ℹ',
    [LogLevel.SUCCESS]: '✓',
    [LogLevel.WARNING]: '⚠',
    [LogLevel.ERROR]: '✗',
    [LogLevel.DEBUG]: '⚙'
};

/**
 * 日志标签
 */
const LOG_LABELS: Record<LogLevel, string> = {
    [LogLevel.INFO]: 'INFO   ',
    [LogLevel.SUCCESS]: 'SUCCESS',
    [LogLevel.WARNING]: 'WARNING',
    [LogLevel.ERROR]: 'ERROR  ',
    [LogLevel.DEBUG]: 'DEBUG  '
};

/**
 * 美化日志输出工具
 * 使用 LogOutputChannel 支持颜色输出
 */
export class Logger {
    private outputChannel: vscode.OutputChannel;
    private logChannel: vscode.LogOutputChannel | null = null;
    private showTimestamp: boolean = true;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        // 尝试创建 LogOutputChannel 用于彩色输出
        try {
            this.logChannel = vscode.window.createOutputChannel('STM32 Build', { log: true });
        } catch {
            // 如果不支持，使用普通输出通道
            this.logChannel = null;
        }
    }

    /**
     * 获取 LogOutputChannel (用于编译输出)
     */
    getLogChannel(): vscode.LogOutputChannel | vscode.OutputChannel {
        return this.logChannel || this.outputChannel;
    }

    /**
     * 获取当前时间戳
     */
    private getTimestamp(): string {
        const now = new Date();
        return now.toLocaleTimeString('zh-CN', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    /**
     * 格式化日志行
     */
    private formatLine(level: LogLevel, message: string): string {
        const icon = LOG_ICONS[level];
        const label = LOG_LABELS[level];
        const timestamp = this.showTimestamp ? `[${this.getTimestamp()}]` : '';
        return `${timestamp} ${icon} ${label} │ ${message}`;
    }

    /**
     * 输出日志
     */
    private log(level: LogLevel, message: string): void {
        this.outputChannel.appendLine(this.formatLine(level, message));
    }

    /**
     * 信息日志
     */
    info(message: string): void {
        this.log(LogLevel.INFO, message);
        if (this.logChannel) {
            this.logChannel.info(message);
        }
    }

    /**
     * 成功日志
     */
    success(message: string): void {
        this.log(LogLevel.SUCCESS, message);
        if (this.logChannel) {
            this.logChannel.info(`✓ ${message}`);
        }
    }

    /**
     * 警告日志
     */
    warn(message: string): void {
        this.log(LogLevel.WARNING, message);
        if (this.logChannel) {
            this.logChannel.warn(message);
        }
    }

    /**
     * 错误日志
     */
    error(message: string): void {
        this.log(LogLevel.ERROR, message);
        if (this.logChannel) {
            this.logChannel.error(message);
        }
    }

    /**
     * 调试日志
     */
    debug(message: string): void {
        this.log(LogLevel.DEBUG, message);
        if (this.logChannel) {
            this.logChannel.debug(message);
        }
    }

    /**
     * 编译输出 - 普通行
     */
    buildOutput(line: string): void {
        if (this.logChannel) {
            this.logChannel.info(line);
        }
        this.outputChannel.appendLine(line);
    }

    /**
     * 编译输出 - 错误行 (红色)
     */
    buildError(line: string): void {
        if (this.logChannel) {
            this.logChannel.error(line);
        }
        this.outputChannel.appendLine(`[ERROR] ${line}`);
    }

    /**
     * 编译输出 - 警告行 (黄色)
     */
    buildWarning(line: string): void {
        if (this.logChannel) {
            this.logChannel.warn(line);
        }
        this.outputChannel.appendLine(`[WARN] ${line}`);
    }

    /**
     * 输出分隔线
     */
    divider(char: string = '─', length: number = 60): void {
        this.outputChannel.appendLine(char.repeat(length));
    }

    /**
     * 输出标题块
     */
    header(title: string): void {
        const line = '═'.repeat(60);
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine(line);
        this.outputChannel.appendLine(`  🔧 ${title}`);
        this.outputChannel.appendLine(line);
    }

    /**
     * 输出子标题
     */
    subHeader(title: string): void {
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine(`  ▸ ${title}`);
        this.outputChannel.appendLine('  ' + '─'.repeat(40));
    }

    /**
     * 输出步骤
     */
    step(stepNum: number, total: number, message: string): void {
        const progress = `[${stepNum}/${total}]`;
        this.outputChannel.appendLine(`  ${progress} ${message}`);
    }

    /**
     * 输出键值对
     */
    keyValue(key: string, value: string, indent: number = 4): void {
        const spaces = ' '.repeat(indent);
        this.outputChannel.appendLine(`${spaces}${key}: ${value}`);
    }

    /**
     * 输出列表项
     */
    listItem(item: string, indent: number = 4): void {
        const spaces = ' '.repeat(indent);
        this.outputChannel.appendLine(`${spaces}• ${item}`);
    }

    /**
     * 输出带图标的列表项
     */
    listItemWithIcon(icon: string, item: string, indent: number = 4): void {
        const spaces = ' '.repeat(indent);
        this.outputChannel.appendLine(`${spaces}${icon} ${item}`);
    }

    /**
     * 输出空行
     */
    blank(): void {
        this.outputChannel.appendLine('');
    }

    /**
     * 输出原始文本
     */
    raw(text: string): void {
        this.outputChannel.appendLine(text);
    }

    /**
     * 输出代码块
     */
    code(code: string, language?: string): void {
        this.outputChannel.appendLine('  ┌' + '─'.repeat(50));
        const lines = code.split('\n');
        for (const line of lines) {
            this.outputChannel.appendLine(`  │ ${line}`);
        }
        this.outputChannel.appendLine('  └' + '─'.repeat(50));
    }

    /**
     * 输出表格
     */
    table(headers: string[], rows: string[][]): void {
        // 计算每列最大宽度
        const colWidths = headers.map((h, i) => {
            const maxDataWidth = Math.max(...rows.map(r => (r[i] || '').length));
            return Math.max(h.length, maxDataWidth);
        });

        // 输出表头
        const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join(' │ ');
        this.outputChannel.appendLine(`    ${headerLine}`);
        
        // 输出分隔线
        const separator = colWidths.map(w => '─'.repeat(w)).join('─┼─');
        this.outputChannel.appendLine(`    ${separator}`);
        
        // 输出数据行
        for (const row of rows) {
            const rowLine = row.map((cell, i) => (cell || '').padEnd(colWidths[i])).join(' │ ');
            this.outputChannel.appendLine(`    ${rowLine}`);
        }
    }

    /**
     * 输出进度条
     */
    progress(current: number, total: number, width: number = 30): void {
        const percent = Math.round((current / total) * 100);
        const filled = Math.round((current / total) * width);
        const empty = width - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        this.outputChannel.appendLine(`    [${bar}] ${percent}%`);
    }

    /**
     * 输出结果摘要
     */
    summary(title: string, items: { label: string; value: string; status?: 'ok' | 'warn' | 'error' }[]): void {
        this.blank();
        this.outputChannel.appendLine(`  📋 ${title}`);
        this.outputChannel.appendLine('  ' + '─'.repeat(45));
        
        for (const item of items) {
            let statusIcon = '';
            if (item.status === 'ok') {
                statusIcon = ' ✓';
            } else if (item.status === 'warn') {
                statusIcon = ' ⚠';
            } else if (item.status === 'error') {
                statusIcon = ' ✗';
            }
            this.outputChannel.appendLine(`    ${item.label.padEnd(20)} ${item.value}${statusIcon}`);
        }
        this.blank();
    }

    /**
     * 输出启动横幅
     */
    banner(): void {
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('  ╔═══════════════════════════════════════════════════════╗');
        this.outputChannel.appendLine('  ║                                                       ║');
        this.outputChannel.appendLine('  ║   ███████╗████████╗███╗   ███╗██████╗ ██████╗        ║');
        this.outputChannel.appendLine('  ║   ██╔════╝╚══██╔══╝████╗ ████║╚════██╗╚════██╗       ║');
        this.outputChannel.appendLine('  ║   ███████╗   ██║   ██╔████╔██║ █████╔╝ █████╔╝       ║');
        this.outputChannel.appendLine('  ║   ╚════██║   ██║   ██║╚██╔╝██║ ╚═══██╗██╔═══╝        ║');
        this.outputChannel.appendLine('  ║   ███████║   ██║   ██║ ╚═╝ ██║██████╔╝███████╗       ║');
        this.outputChannel.appendLine('  ║   ╚══════╝   ╚═╝   ╚═╝     ╚═╝╚═════╝ ╚══════╝       ║');
        this.outputChannel.appendLine('  ║                                                       ║');
        this.outputChannel.appendLine('  ║          Development Tools for VS Code               ║');
        this.outputChannel.appendLine('  ║                                                       ║');
        this.outputChannel.appendLine('  ╚═══════════════════════════════════════════════════════╝');
        this.outputChannel.appendLine('');
    }

    /**
     * 输出简洁横幅
     */
    simpleBanner(): void {
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('  ┌─────────────────────────────────────────────────┐');
        this.outputChannel.appendLine('  │  🔧 STM32 Development Tools                     │');
        this.outputChannel.appendLine('  │     Powered by CMake + OpenOCD + Cortex-Debug   │');
        this.outputChannel.appendLine('  └─────────────────────────────────────────────────┘');
        this.outputChannel.appendLine('');
    }

    /**
     * 显示输出通道
     */
    show(): void {
        this.outputChannel.show();
    }

    /**
     * 显示编译输出通道
     */
    showBuild(): void {
        if (this.logChannel) {
            this.logChannel.show();
        } else {
            this.outputChannel.show();
        }
    }

    /**
     * 清空输出
     */
    clear(): void {
        this.outputChannel.clear();
    }

    /**
     * 清空编译输出
     */
    clearBuild(): void {
        if (this.logChannel) {
            this.logChannel.clear();
        }
    }

    /**
     * 释放资源
     */
    dispose(): void {
        if (this.logChannel) {
            this.logChannel.dispose();
        }
    }
}
