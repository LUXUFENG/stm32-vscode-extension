import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class STM32ProjectProvider implements vscode.TreeDataProvider<ProjectItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ProjectItem | undefined | null | void> = new vscode.EventEmitter<ProjectItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ProjectItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ProjectItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ProjectItem): Thenable<ProjectItem[]> {
        if (!element) {
            return Promise.resolve(this.getRootItems());
        }
        return Promise.resolve(element.children || []);
    }

    private getRootItems(): ProjectItem[] {
        const items: ProjectItem[] = [];
        const config = vscode.workspace.getConfiguration('stm32');

        // 芯片信息
        const chip = config.get<string>('selectedChip');
        const chipItem = new ProjectItem(
            '芯片型号',
            chip || '未选择',
            vscode.TreeItemCollapsibleState.None,
            {
                command: 'stm32.selectChip',
                title: '选择芯片'
            }
        );
        chipItem.iconPath = new vscode.ThemeIcon('circuit-board');
        items.push(chipItem);

        // 调试器信息
        const debugInterface = config.get<string>('debugInterface') || 'stlink';
        const debugItem = new ProjectItem(
            '调试器',
            debugInterface.toUpperCase(),
            vscode.TreeItemCollapsibleState.None
        );
        debugItem.iconPath = new vscode.ThemeIcon('debug');
        items.push(debugItem);

        // 构建类型
        const buildType = config.get<string>('buildType') || 'Debug';
        const buildTypeItem = new ProjectItem(
            '构建类型',
            buildType,
            vscode.TreeItemCollapsibleState.None
        );
        buildTypeItem.iconPath = new vscode.ThemeIcon('wrench');
        items.push(buildTypeItem);

        // 工具链信息
        const toolchainPath = config.get<string>('toolchainPath');
        const toolchainItem = new ProjectItem(
            '工具链',
            toolchainPath ? path.basename(toolchainPath) : 'arm-none-eabi-gcc (PATH)',
            vscode.TreeItemCollapsibleState.None
        );
        toolchainItem.iconPath = new vscode.ThemeIcon('tools');
        items.push(toolchainItem);

        // 构建目录
        const buildDir = config.get<string>('buildDirectory') || 'build';
        const buildDirItem = new ProjectItem(
            '构建目录',
            buildDir,
            vscode.TreeItemCollapsibleState.None
        );
        buildDirItem.iconPath = new vscode.ThemeIcon('folder');
        items.push(buildDirItem);

        // OpenOCD 信息
        const openocdPath = config.get<string>('openocdPath');
        const openocdItem = new ProjectItem(
            'OpenOCD',
            openocdPath ? this.getFileName(openocdPath) : '未配置 (点击检测)',
            vscode.TreeItemCollapsibleState.None,
            openocdPath ? undefined : { command: 'stm32.detectToolchain', title: '检测工具链' }
        );
        openocdItem.iconPath = new vscode.ThemeIcon('plug');
        items.push(openocdItem);

        // 快速操作
        const actionsItem = new ProjectItem(
            '快速操作',
            '',
            vscode.TreeItemCollapsibleState.Expanded
        );
        actionsItem.iconPath = new vscode.ThemeIcon('zap');
        actionsItem.children = this.getActionItems();
        items.push(actionsItem);

        // 项目文件
        const filesItem = new ProjectItem(
            '项目文件',
            '',
            vscode.TreeItemCollapsibleState.Collapsed
        );
        filesItem.iconPath = new vscode.ThemeIcon('files');
        filesItem.children = this.getProjectFiles();
        items.push(filesItem);

        return items;
    }

    private getActionItems(): ProjectItem[] {
        const actions: ProjectItem[] = [];

        const buildAction = new ProjectItem(
            '编译项目',
            '',
            vscode.TreeItemCollapsibleState.None,
            { command: 'stm32.build', title: '编译' }
        );
        buildAction.iconPath = new vscode.ThemeIcon('tools');
        actions.push(buildAction);

        const cleanAction = new ProjectItem(
            '清理项目',
            '',
            vscode.TreeItemCollapsibleState.None,
            { command: 'stm32.clean', title: '清理' }
        );
        cleanAction.iconPath = new vscode.ThemeIcon('trash');
        actions.push(cleanAction);

        const flashAction = new ProjectItem(
            '下载程序',
            '',
            vscode.TreeItemCollapsibleState.None,
            { command: 'stm32.flash', title: '下载' }
        );
        flashAction.iconPath = new vscode.ThemeIcon('arrow-down');
        actions.push(flashAction);

        const debugAction = new ProjectItem(
            '开始调试',
            '',
            vscode.TreeItemCollapsibleState.None,
            { command: 'stm32.debug', title: '调试' }
        );
        debugAction.iconPath = new vscode.ThemeIcon('debug-alt');
        actions.push(debugAction);

        const detectAction = new ProjectItem(
            '检测工具链',
            '',
            vscode.TreeItemCollapsibleState.None,
            { command: 'stm32.detectToolchain', title: '检测' }
        );
        detectAction.iconPath = new vscode.ThemeIcon('search');
        actions.push(detectAction);

        return actions;
    }

    private getFileName(filePath: string): string {
        return path.basename(filePath);
    }

    private getProjectFiles(): ProjectItem[] {
        const files: ProjectItem[] = [];
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            return files;
        }

        const importantFiles = [
            'CMakeLists.txt',
            'Makefile',
            '.ioc', // STM32CubeMX 配置文件
            'startup_*.s',
            '*_hal_conf.h'
        ];

        // 检查 CMakeLists.txt
        const cmakePath = path.join(workspaceFolder.uri.fsPath, 'CMakeLists.txt');
        if (fs.existsSync(cmakePath)) {
            const cmakeItem = new ProjectItem(
                'CMakeLists.txt',
                '',
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'vscode.open',
                    title: '打开',
                    arguments: [vscode.Uri.file(cmakePath)]
                }
            );
            cmakeItem.iconPath = new vscode.ThemeIcon('file-code');
            files.push(cmakeItem);
        }

        // 查找 .ioc 文件
        try {
            const workspaceFiles = fs.readdirSync(workspaceFolder.uri.fsPath);
            for (const file of workspaceFiles) {
                if (file.endsWith('.ioc')) {
                    const iocPath = path.join(workspaceFolder.uri.fsPath, file);
                    const iocItem = new ProjectItem(
                        file,
                        'STM32CubeMX 配置',
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: 'vscode.open',
                            title: '打开',
                            arguments: [vscode.Uri.file(iocPath)]
                        }
                    );
                    iocItem.iconPath = new vscode.ThemeIcon('settings-gear');
                    files.push(iocItem);
                }
            }
        } catch {
            // 忽略错误
        }

        // 链接脚本
        const linkScripts = ['*.ld', 'LinkerScript.ld', 'STM32*.ld'];
        try {
            const workspaceFiles = fs.readdirSync(workspaceFolder.uri.fsPath);
            for (const file of workspaceFiles) {
                if (file.endsWith('.ld')) {
                    const ldPath = path.join(workspaceFolder.uri.fsPath, file);
                    const ldItem = new ProjectItem(
                        file,
                        '链接脚本',
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: 'vscode.open',
                            title: '打开',
                            arguments: [vscode.Uri.file(ldPath)]
                        }
                    );
                    ldItem.iconPath = new vscode.ThemeIcon('file-binary');
                    files.push(ldItem);
                }
            }
        } catch {
            // 忽略错误
        }

        return files;
    }
}

export class ProjectItem extends vscode.TreeItem {
    children?: ProjectItem[];

    constructor(
        public readonly label: string,
        public readonly value: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.description = value;
        this.tooltip = `${label}: ${value}`;
    }
}

