import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface SVDPeripheral {
    name: string;
    description: string;
    baseAddress: string;
    registers: SVDRegister[];
}

interface SVDRegister {
    name: string;
    description: string;
    addressOffset: string;
    size: number;
    fields?: SVDField[];
}

interface SVDField {
    name: string;
    description: string;
    bitOffset: number;
    bitWidth: number;
}

export class PeripheralTreeProvider implements vscode.TreeDataProvider<PeripheralItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<PeripheralItem | undefined | null | void> = new vscode.EventEmitter<PeripheralItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PeripheralItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private debugSession: vscode.DebugSession | null = null;
    private peripherals: SVDPeripheral[] = [];
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setDebugSession(session: vscode.DebugSession): void {
        this.debugSession = session;
        this.loadSVDFile();
        this.refresh();
    }

    clearDebugSession(): void {
        this.debugSession = null;
        this.peripherals = [];
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: PeripheralItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PeripheralItem): Promise<PeripheralItem[]> {
        if (!this.debugSession) {
            return [new PeripheralItem(
                '调试未启动',
                '',
                '',
                'info',
                vscode.TreeItemCollapsibleState.None
            )];
        }

        if (!element) {
            return this.getPeripherals();
        }

        if (element.itemType === 'peripheral') {
            return this.getRegisters(element.name);
        }

        if (element.itemType === 'register' && element.fields) {
            return element.fields.map(field => {
                const item = new PeripheralItem(
                    field.name,
                    `[${field.bitOffset}:${field.bitOffset + field.bitWidth - 1}]`,
                    field.description,
                    'field',
                    vscode.TreeItemCollapsibleState.None
                );
                item.iconPath = new vscode.ThemeIcon('symbol-field');
                return item;
            });
        }

        return [];
    }

    private async loadSVDFile(): Promise<void> {
        const config = vscode.workspace.getConfiguration('stm32');
        const svdFile = config.get<string>('svdFile');

        if (!svdFile) {
            // 尝试自动查找 SVD 文件
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                const svdFiles = await vscode.workspace.findFiles('**/*.svd', '**/node_modules/**', 1);
                if (svdFiles.length > 0) {
                    await this.parseSVDFile(svdFiles[0].fsPath);
                    return;
                }
            }
            return;
        }

        let svdPath = svdFile;
        if (!path.isAbsolute(svdPath)) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                svdPath = path.join(workspaceFolder.uri.fsPath, svdFile);
            }
        }

        if (fs.existsSync(svdPath)) {
            await this.parseSVDFile(svdPath);
        }
    }

    private async parseSVDFile(filePath: string): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            // 简化的 SVD 解析，实际使用时应该使用 xml2js 或类似库
            this.peripherals = this.parseSimpleSVD(content);
        } catch (error) {
            console.error('解析 SVD 文件失败:', error);
            // 使用预定义的外设列表
            this.peripherals = this.getDefaultPeripherals();
        }
    }

    private parseSimpleSVD(content: string): SVDPeripheral[] {
        // 简化实现，返回默认外设
        // 实际实现应使用完整的 XML 解析
        return this.getDefaultPeripherals();
    }

    private getDefaultPeripherals(): SVDPeripheral[] {
        // 返回常见的 STM32 外设
        return [
            {
                name: 'RCC',
                description: '复位和时钟控制',
                baseAddress: '0x40021000',
                registers: [
                    { name: 'CR', description: '时钟控制寄存器', addressOffset: '0x00', size: 32 },
                    { name: 'CFGR', description: '时钟配置寄存器', addressOffset: '0x04', size: 32 },
                    { name: 'CIR', description: '时钟中断寄存器', addressOffset: '0x08', size: 32 },
                    { name: 'APB2RSTR', description: 'APB2 外设复位寄存器', addressOffset: '0x0C', size: 32 },
                    { name: 'APB1RSTR', description: 'APB1 外设复位寄存器', addressOffset: '0x10', size: 32 },
                    { name: 'AHBENR', description: 'AHB 外设时钟使能', addressOffset: '0x14', size: 32 },
                    { name: 'APB2ENR', description: 'APB2 外设时钟使能', addressOffset: '0x18', size: 32 },
                    { name: 'APB1ENR', description: 'APB1 外设时钟使能', addressOffset: '0x1C', size: 32 },
                ]
            },
            {
                name: 'GPIOA',
                description: '通用输入/输出端口 A',
                baseAddress: '0x40010800',
                registers: [
                    { name: 'CRL', description: '端口配置低寄存器', addressOffset: '0x00', size: 32 },
                    { name: 'CRH', description: '端口配置高寄存器', addressOffset: '0x04', size: 32 },
                    { name: 'IDR', description: '端口输入数据寄存器', addressOffset: '0x08', size: 32 },
                    { name: 'ODR', description: '端口输出数据寄存器', addressOffset: '0x0C', size: 32 },
                    { name: 'BSRR', description: '端口位设置/复位寄存器', addressOffset: '0x10', size: 32 },
                    { name: 'BRR', description: '端口位复位寄存器', addressOffset: '0x14', size: 32 },
                    { name: 'LCKR', description: '端口配置锁定寄存器', addressOffset: '0x18', size: 32 },
                ]
            },
            {
                name: 'GPIOB',
                description: '通用输入/输出端口 B',
                baseAddress: '0x40010C00',
                registers: [
                    { name: 'CRL', description: '端口配置低寄存器', addressOffset: '0x00', size: 32 },
                    { name: 'CRH', description: '端口配置高寄存器', addressOffset: '0x04', size: 32 },
                    { name: 'IDR', description: '端口输入数据寄存器', addressOffset: '0x08', size: 32 },
                    { name: 'ODR', description: '端口输出数据寄存器', addressOffset: '0x0C', size: 32 },
                    { name: 'BSRR', description: '端口位设置/复位寄存器', addressOffset: '0x10', size: 32 },
                    { name: 'BRR', description: '端口位复位寄存器', addressOffset: '0x14', size: 32 },
                    { name: 'LCKR', description: '端口配置锁定寄存器', addressOffset: '0x18', size: 32 },
                ]
            },
            {
                name: 'GPIOC',
                description: '通用输入/输出端口 C',
                baseAddress: '0x40011000',
                registers: [
                    { name: 'CRL', description: '端口配置低寄存器', addressOffset: '0x00', size: 32 },
                    { name: 'CRH', description: '端口配置高寄存器', addressOffset: '0x04', size: 32 },
                    { name: 'IDR', description: '端口输入数据寄存器', addressOffset: '0x08', size: 32 },
                    { name: 'ODR', description: '端口输出数据寄存器', addressOffset: '0x0C', size: 32 },
                ]
            },
            {
                name: 'USART1',
                description: '通用同步/异步收发器 1',
                baseAddress: '0x40013800',
                registers: [
                    { name: 'SR', description: '状态寄存器', addressOffset: '0x00', size: 32 },
                    { name: 'DR', description: '数据寄存器', addressOffset: '0x04', size: 32 },
                    { name: 'BRR', description: '波特率寄存器', addressOffset: '0x08', size: 32 },
                    { name: 'CR1', description: '控制寄存器 1', addressOffset: '0x0C', size: 32 },
                    { name: 'CR2', description: '控制寄存器 2', addressOffset: '0x10', size: 32 },
                    { name: 'CR3', description: '控制寄存器 3', addressOffset: '0x14', size: 32 },
                    { name: 'GTPR', description: '保护时间和预分频寄存器', addressOffset: '0x18', size: 32 },
                ]
            },
            {
                name: 'TIM1',
                description: '高级控制定时器 1',
                baseAddress: '0x40012C00',
                registers: [
                    { name: 'CR1', description: '控制寄存器 1', addressOffset: '0x00', size: 32 },
                    { name: 'CR2', description: '控制寄存器 2', addressOffset: '0x04', size: 32 },
                    { name: 'SMCR', description: '从模式控制寄存器', addressOffset: '0x08', size: 32 },
                    { name: 'DIER', description: 'DMA/中断使能寄存器', addressOffset: '0x0C', size: 32 },
                    { name: 'SR', description: '状态寄存器', addressOffset: '0x10', size: 32 },
                    { name: 'CNT', description: '计数器', addressOffset: '0x24', size: 32 },
                    { name: 'PSC', description: '预分频器', addressOffset: '0x28', size: 32 },
                    { name: 'ARR', description: '自动重装载寄存器', addressOffset: '0x2C', size: 32 },
                ]
            },
            {
                name: 'TIM2',
                description: '通用定时器 2',
                baseAddress: '0x40000000',
                registers: [
                    { name: 'CR1', description: '控制寄存器 1', addressOffset: '0x00', size: 32 },
                    { name: 'CR2', description: '控制寄存器 2', addressOffset: '0x04', size: 32 },
                    { name: 'SMCR', description: '从模式控制寄存器', addressOffset: '0x08', size: 32 },
                    { name: 'DIER', description: 'DMA/中断使能寄存器', addressOffset: '0x0C', size: 32 },
                    { name: 'SR', description: '状态寄存器', addressOffset: '0x10', size: 32 },
                    { name: 'CNT', description: '计数器', addressOffset: '0x24', size: 32 },
                    { name: 'PSC', description: '预分频器', addressOffset: '0x28', size: 32 },
                    { name: 'ARR', description: '自动重装载寄存器', addressOffset: '0x2C', size: 32 },
                ]
            },
            {
                name: 'SPI1',
                description: '串行外设接口 1',
                baseAddress: '0x40013000',
                registers: [
                    { name: 'CR1', description: '控制寄存器 1', addressOffset: '0x00', size: 32 },
                    { name: 'CR2', description: '控制寄存器 2', addressOffset: '0x04', size: 32 },
                    { name: 'SR', description: '状态寄存器', addressOffset: '0x08', size: 32 },
                    { name: 'DR', description: '数据寄存器', addressOffset: '0x0C', size: 32 },
                ]
            },
            {
                name: 'I2C1',
                description: 'I2C 接口 1',
                baseAddress: '0x40005400',
                registers: [
                    { name: 'CR1', description: '控制寄存器 1', addressOffset: '0x00', size: 32 },
                    { name: 'CR2', description: '控制寄存器 2', addressOffset: '0x04', size: 32 },
                    { name: 'OAR1', description: '自身地址寄存器 1', addressOffset: '0x08', size: 32 },
                    { name: 'OAR2', description: '自身地址寄存器 2', addressOffset: '0x0C', size: 32 },
                    { name: 'DR', description: '数据寄存器', addressOffset: '0x10', size: 32 },
                    { name: 'SR1', description: '状态寄存器 1', addressOffset: '0x14', size: 32 },
                    { name: 'SR2', description: '状态寄存器 2', addressOffset: '0x18', size: 32 },
                ]
            },
            {
                name: 'ADC1',
                description: '模数转换器 1',
                baseAddress: '0x40012400',
                registers: [
                    { name: 'SR', description: '状态寄存器', addressOffset: '0x00', size: 32 },
                    { name: 'CR1', description: '控制寄存器 1', addressOffset: '0x04', size: 32 },
                    { name: 'CR2', description: '控制寄存器 2', addressOffset: '0x08', size: 32 },
                    { name: 'SMPR1', description: '采样时间寄存器 1', addressOffset: '0x0C', size: 32 },
                    { name: 'SMPR2', description: '采样时间寄存器 2', addressOffset: '0x10', size: 32 },
                    { name: 'DR', description: '数据寄存器', addressOffset: '0x4C', size: 32 },
                ]
            },
            {
                name: 'DMA1',
                description: 'DMA 控制器 1',
                baseAddress: '0x40020000',
                registers: [
                    { name: 'ISR', description: '中断状态寄存器', addressOffset: '0x00', size: 32 },
                    { name: 'IFCR', description: '中断标志清除寄存器', addressOffset: '0x04', size: 32 },
                ]
            },
            {
                name: 'NVIC',
                description: '嵌套向量中断控制器',
                baseAddress: '0xE000E100',
                registers: [
                    { name: 'ISER0', description: '中断使能寄存器 0', addressOffset: '0x00', size: 32 },
                    { name: 'ISER1', description: '中断使能寄存器 1', addressOffset: '0x04', size: 32 },
                    { name: 'ICER0', description: '中断清除使能寄存器 0', addressOffset: '0x80', size: 32 },
                    { name: 'ICER1', description: '中断清除使能寄存器 1', addressOffset: '0x84', size: 32 },
                ]
            },
            {
                name: 'SCB',
                description: '系统控制块',
                baseAddress: '0xE000ED00',
                registers: [
                    { name: 'CPUID', description: 'CPU ID 寄存器', addressOffset: '0x00', size: 32 },
                    { name: 'ICSR', description: '中断控制状态寄存器', addressOffset: '0x04', size: 32 },
                    { name: 'VTOR', description: '向量表偏移寄存器', addressOffset: '0x08', size: 32 },
                    { name: 'AIRCR', description: '应用中断和复位控制寄存器', addressOffset: '0x0C', size: 32 },
                ]
            },
        ];
    }

    private getPeripherals(): PeripheralItem[] {
        return this.peripherals.map(peripheral => {
            const item = new PeripheralItem(
                peripheral.name,
                peripheral.baseAddress,
                peripheral.description,
                'peripheral',
                vscode.TreeItemCollapsibleState.Collapsed
            );
            item.iconPath = new vscode.ThemeIcon('symbol-interface');
            return item;
        });
    }

    private getRegisters(peripheralName: string): PeripheralItem[] {
        const peripheral = this.peripherals.find(p => p.name === peripheralName);
        if (!peripheral) {
            return [];
        }

        return peripheral.registers.map(reg => {
            const item = new PeripheralItem(
                reg.name,
                reg.addressOffset,
                reg.description,
                'register',
                reg.fields ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
            );
            item.iconPath = new vscode.ThemeIcon('symbol-property');
            if (reg.fields) {
                item.fields = reg.fields;
            }
            return item;
        });
    }
}

export class PeripheralItem extends vscode.TreeItem {
    fields?: SVDField[];

    constructor(
        public readonly name: string,
        public readonly address: string,
        public readonly desc: string,
        public readonly itemType: 'peripheral' | 'register' | 'field' | 'info',
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(name, collapsibleState);
        this.tooltip = `${name} @ ${address}\n${desc}`;
        this.description = address;
    }

    contextValue = 'peripheral';
}

