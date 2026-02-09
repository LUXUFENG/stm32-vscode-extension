import * as vscode from 'vscode';
import { getSTM32Config } from '../utils/config';
import { DEBUGGER_NAMES } from '../utils/chipUtils';

class SidebarItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly value?: string,
        public readonly cmd?: string,
        collapsible: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(label, collapsible);
        if (value) {
            this.description = value;
        }
        if (cmd) {
            this.command = { command: cmd, title: label };
        }
    }
}

export class ProjectInfoProvider implements vscode.TreeDataProvider<SidebarItem> {
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChange.event;

    refresh(): void { this._onDidChange.fire(); }

    getTreeItem(el: SidebarItem): SidebarItem { return el; }

    getChildren(): SidebarItem[] {
        const config = getSTM32Config();
        const items: SidebarItem[] = [];

        const chip = config.selectedChip || '未选择';
        const chipItem = new SidebarItem('$(circuit-board) 芯片', chip, 'stm32.selectChip');
        chipItem.tooltip = '点击选择芯片型号';
        items.push(chipItem);

        const debuggerName = DEBUGGER_NAMES[config.debugInterface] || config.debugInterface;
        const dbgItem = new SidebarItem('$(plug) 调试器', debuggerName, 'stm32.selectDebugger');
        dbgItem.tooltip = '点击选择调试器';
        items.push(dbgItem);

        const btItem = new SidebarItem('$(gear) 构建类型', config.buildType, 'stm32.selectBuildType');
        btItem.tooltip = '点击选择构建类型';
        items.push(btItem);

        items.push(new SidebarItem('$(search) 工具链', '', 'stm32.detectToolchain'));

        const toolItems: string[] = [];
        if (config.toolchainPath) { toolItems.push('GCC'); }
        if (config.cmakePath && config.cmakePath !== 'cmake') { toolItems.push('CMake'); }
        if (config.ninjaPath) { toolItems.push('Ninja'); }
        if (config.openocdPath && config.openocdPath !== 'openocd') { toolItems.push('OpenOCD'); }

        if (toolItems.length > 0) {
            const toolStatus = new SidebarItem('$(check) 已安装', toolItems.join(', '));
            toolStatus.tooltip = `GCC: ${config.toolchainPath}\nCMake: ${config.cmakePath}\nNinja: ${config.ninjaPath}\nOpenOCD: ${config.openocdPath}`;
            items.push(toolStatus);
        } else {
            items.push(new SidebarItem('$(warning) 未配置工具链', '', 'stm32.detectToolchain'));
        }

        return items;
    }
}

export class ActionsProvider implements vscode.TreeDataProvider<SidebarItem> {
    private _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChange.event;

    refresh(): void { this._onDidChange.fire(); }

    getTreeItem(el: SidebarItem): SidebarItem { return el; }

    getChildren(): SidebarItem[] {
        return [
            new SidebarItem('$(tools) 编译项目', '', 'stm32.build'),
            new SidebarItem('$(trash) 清理项目', '', 'stm32.clean'),
            new SidebarItem('$(refresh) 重新编译', '', 'stm32.rebuild'),
            new SidebarItem('$(arrow-down) 烧录程序', '', 'stm32.flash'),
            new SidebarItem('$(debug-alt) 开始调试', '', 'stm32.debug'),
            new SidebarItem('$(file-binary) 生成 BIN/HEX', '', 'stm32.generateBin'),
        ];
    }
}
