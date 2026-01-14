import * as vscode from 'vscode';

interface RegisterInfo {
    name: string;
    value: string;
    description?: string;
}

export class RegisterTreeProvider implements vscode.TreeDataProvider<RegisterItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<RegisterItem | undefined | null | void> = new vscode.EventEmitter<RegisterItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<RegisterItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private debugSession: vscode.DebugSession | null = null;
    private registers: RegisterInfo[] = [];

    refresh(): void {
        this.updateRegisters();
        this._onDidChangeTreeData.fire();
    }

    setDebugSession(session: vscode.DebugSession): void {
        this.debugSession = session;
        this.refresh();
    }

    clearDebugSession(): void {
        this.debugSession = null;
        this.registers = [];
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: RegisterItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: RegisterItem): Promise<RegisterItem[]> {
        if (!this.debugSession) {
            return [new RegisterItem('调试未启动', '', '', vscode.TreeItemCollapsibleState.None)];
        }

        if (!element) {
            return this.getRootItems();
        }

        if (element.children) {
            return element.children;
        }

        return [];
    }

    private async getRootItems(): Promise<RegisterItem[]> {
        const items: RegisterItem[] = [];

        // Core Registers
        const coreRegs = new RegisterItem(
            '核心寄存器',
            '',
            'Core Registers',
            vscode.TreeItemCollapsibleState.Expanded
        );
        coreRegs.iconPath = new vscode.ThemeIcon('symbol-structure');
        coreRegs.children = await this.getCoreRegisters();
        items.push(coreRegs);

        // Special Registers
        const specialRegs = new RegisterItem(
            '特殊寄存器',
            '',
            'Special Registers',
            vscode.TreeItemCollapsibleState.Collapsed
        );
        specialRegs.iconPath = new vscode.ThemeIcon('symbol-constant');
        specialRegs.children = this.getSpecialRegisters();
        items.push(specialRegs);

        // FPU Registers (if available)
        const fpuRegs = new RegisterItem(
            'FPU 寄存器',
            '',
            'Floating Point Registers',
            vscode.TreeItemCollapsibleState.Collapsed
        );
        fpuRegs.iconPath = new vscode.ThemeIcon('symbol-number');
        fpuRegs.children = await this.getFPURegisters();
        items.push(fpuRegs);

        return items;
    }

    private async getCoreRegisters(): Promise<RegisterItem[]> {
        const items: RegisterItem[] = [];
        
        // ARM Cortex-M 核心寄存器
        const coreRegNames = [
            { name: 'R0', desc: '通用寄存器 0' },
            { name: 'R1', desc: '通用寄存器 1' },
            { name: 'R2', desc: '通用寄存器 2' },
            { name: 'R3', desc: '通用寄存器 3' },
            { name: 'R4', desc: '通用寄存器 4' },
            { name: 'R5', desc: '通用寄存器 5' },
            { name: 'R6', desc: '通用寄存器 6' },
            { name: 'R7', desc: '通用寄存器 7' },
            { name: 'R8', desc: '通用寄存器 8' },
            { name: 'R9', desc: '通用寄存器 9' },
            { name: 'R10', desc: '通用寄存器 10' },
            { name: 'R11', desc: '通用寄存器 11 (FP)' },
            { name: 'R12', desc: '通用寄存器 12 (IP)' },
            { name: 'SP', desc: '栈指针 (R13)' },
            { name: 'LR', desc: '链接寄存器 (R14)' },
            { name: 'PC', desc: '程序计数器 (R15)' },
        ];

        for (const reg of coreRegNames) {
            const value = await this.getRegisterValue(reg.name);
            const item = new RegisterItem(
                reg.name,
                value,
                reg.desc,
                vscode.TreeItemCollapsibleState.None
            );
            item.iconPath = new vscode.ThemeIcon('symbol-variable');
            items.push(item);
        }

        return items;
    }

    private getSpecialRegisters(): RegisterItem[] {
        const items: RegisterItem[] = [];
        
        const specialRegs = [
            { name: 'xPSR', desc: '程序状态寄存器' },
            { name: 'MSP', desc: '主栈指针' },
            { name: 'PSP', desc: '进程栈指针' },
            { name: 'PRIMASK', desc: '中断屏蔽寄存器' },
            { name: 'FAULTMASK', desc: '故障屏蔽寄存器' },
            { name: 'BASEPRI', desc: '基础优先级寄存器' },
            { name: 'CONTROL', desc: '控制寄存器' },
        ];

        for (const reg of specialRegs) {
            const item = new RegisterItem(
                reg.name,
                '---',
                reg.desc,
                vscode.TreeItemCollapsibleState.None
            );
            item.iconPath = new vscode.ThemeIcon('key');
            items.push(item);
        }

        return items;
    }

    private async getFPURegisters(): Promise<RegisterItem[]> {
        const items: RegisterItem[] = [];
        
        // S0-S31 单精度浮点寄存器
        for (let i = 0; i < 32; i++) {
            const item = new RegisterItem(
                `S${i}`,
                '---',
                `单精度浮点寄存器 ${i}`,
                vscode.TreeItemCollapsibleState.None
            );
            item.iconPath = new vscode.ThemeIcon('symbol-number');
            items.push(item);
        }

        // FPSCR
        const fpscrItem = new RegisterItem(
            'FPSCR',
            '---',
            '浮点状态和控制寄存器',
            vscode.TreeItemCollapsibleState.None
        );
        fpscrItem.iconPath = new vscode.ThemeIcon('key');
        items.push(fpscrItem);

        return items;
    }

    private async getRegisterValue(regName: string): Promise<string> {
        if (!this.debugSession) {
            return '---';
        }

        try {
            // 尝试通过调试会话获取寄存器值
            const response = await this.debugSession.customRequest('evaluate', {
                expression: `$${regName.toLowerCase()}`,
                context: 'watch'
            });
            
            if (response && response.result) {
                return response.result;
            }
        } catch {
            // 忽略错误
        }

        return '---';
    }

    private async updateRegisters(): Promise<void> {
        if (!this.debugSession) {
            return;
        }

        // 更新寄存器值的逻辑
        // 这里可以添加更复杂的逻辑来获取和缓存寄存器值
    }
}

export class RegisterItem extends vscode.TreeItem {
    children?: RegisterItem[];

    constructor(
        public readonly label: string,
        public readonly value: string,
        public readonly description: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = `${label}: ${value}\n${description}`;
        
        if (value && value !== '---' && value !== '') {
            this.description = value;
        }
    }

    contextValue = 'register';
}

