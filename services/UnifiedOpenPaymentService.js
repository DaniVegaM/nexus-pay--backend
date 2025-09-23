import { createOpenPaymentsService, DEFAULT_TEST_CONFIG } from "./ClientOpenPaymentsService.js";
import OneTimePaymentService from "./OneTimePaymentService.js";
import RecurringPaymentService from "./RecurringPaymentService.js";
import SplitPaymentService from "./SplitPaymentService.js";
import FuturePaymentService from "./FuturePaymentService.js";
import {OpenPaymentsClientError} from "@interledger/open-payments";

/*
*ESTO SI EN REALIDAD ES UN SDK, PROVEE UN SERVICIO PARA EJECUTAR CUALQUIER CASO DE USO, SOBRE EL API DE OPEN PAYMENTS
* */
class UnifiedPaymentService {
    constructor(config = DEFAULT_TEST_CONFIG) {
        this.config = config;

        // Inicializar todos los servicios especializados
        this.oneTimeService = new OneTimePaymentService(config);
        this.recurringService = new RecurringPaymentService(config);
        this.splitService = new SplitPaymentService(config);
        this.futureService = new FuturePaymentService(config);
        this.openPaymentService= createOpenPaymentsService(config);

        // Registro central de todas las operaciones
        this.operationsRegistry = new Map();
        this.activeMonitors = new Map();
    }

    // ===== PAGOS ÚNICOS =====

    /**
     * Realiza un pago único simple
     * @param {string} from - Wallet del pagador
     * @param {string} to - Wallet del receptor
     * @param {number} amount - Monto a pagar
     * @param {Object} [options] - Opciones adicionales
     * @returns {Object} Resultado del pago
     */
    async sendPayment(from, to, amount, options = {}) {
        try {
            console.log(`💸 Enviando pago único: $${amount / 100} de ${from} a ${to}`);

            const operationId = this._generateOperationId('one_time');

            const result = await this.oneTimeService.processPayment(
                from,
                to,
                amount,
                options.onAuthorizationNeeded
            );

            this._registerOperation(operationId, 'one_time_payment', 'completed', {
                from,
                to,
                amount,
                result
            });

            console.log("✅ Pago único completado exitosamente");
            return { operationId, type: 'one_time_payment', ...result };

        } catch (error) {
            console.error("❌ Error en pago único:", error.message);
            throw error;
        }
    }

    /**
     * Prepara un pago único (para casos que requieren autorización manual)
     */
    async prepareSinglePayment(from, to, amount, options = {}) {
        try {
            console.log(`🔄 Preparando pago único: $${amount / 100}`);

            const operationId = this._generateOperationId('one_time_prep');

            const prepared = await this.oneTimeService.preparePayment(from, to, amount);

            this._registerOperation(operationId, 'one_time_prepared', 'pending', {
                from,
                to,
                amount,
                prepared
            });

            return { operationId, type: 'one_time_prepared', ...prepared };

        } catch (error) {
            console.error("❌ Error preparando pago único:", error.message);
            throw error;
        }
    }

    /**
     * Completa un pago único previamente preparado
     */
    async completeSinglePayment(operationId) {
        try {
            const operation = this.operationsRegistry.get(operationId);
            if (!operation || operation.type !== 'one_time_prepared') {
                throw new Error(`Operación ${operationId} no encontrada o no es un pago preparado`);
            }

            const result = await this.oneTimeService.completePayment(operation.data.prepared);

            this._updateOperationStatus(operationId, 'completed', { result });

            return { operationId, type: 'one_time_payment', ...result };

        } catch (error) {
            console.error("❌ Error completando pago único:", error.message);
            throw error;
        }
    }

    // ===== PAGOS RECURRENTES =====

    /**
     * Configura un pago recurrente (suscripción, nómina, etc.)
     * @param {string} from - Wallet del pagador
     * @param {string} to - Wallet del receptor
     * @param {number} amount - Monto por pago
     * @param {Object} schedule - Configuración del cronograma
     * @param {Object} [options] - Opciones adicionales
     */
    async setupRecurringPayment(from, to, amount, schedule, options = {}) {
        try {
            console.log(`🔄 Configurando pago recurrente: $${amount / 100} cada ${schedule.interval}`);

            const operationId = this._generateOperationId('recurring');

            const recurringConfig = {
                totalAmount: schedule.totalAmount || amount * (schedule.maxPayments || 12),
                interval: schedule.interval,
                maxPayments: schedule.maxPayments,
                ...schedule
            };

            const prepared = await this.recurringService.prepareRecurringPayment(
                from,
                to,
                amount.toString(),
                recurringConfig
            );

            let recurringId;
            if (prepared.type === 'authorization_required') {
                this._registerOperation(operationId, 'recurring_pending_auth', 'pending_authorization', {
                    from,
                    to,
                    amount,
                    schedule: recurringConfig,
                    prepared
                });

                return {
                    operationId,
                    type: 'recurring_pending_auth',
                    authorizationUrl: prepared.authorizationUrl,
                    ...prepared
                };
            } else {
                recurringId = prepared.recurringPaymentId;
            }

            this._registerOperation(operationId, 'recurring_payment', 'active', {
                from,
                to,
                amount,
                schedule: recurringConfig,
                recurringId
            });

            console.log("✅ Pago recurrente configurado exitosamente");
            return { operationId, type: 'recurring_payment', recurringId, ...prepared };

        } catch (error) {
            console.error("❌ Error configurando pago recurrente:", error.message);
            throw error;
        }
    }

    /**
     * Ejecuta el siguiente pago de una serie recurrente
     */
    async executeNextRecurringPayment(operationId) {
        try {
            const operation = this.operationsRegistry.get(operationId);
            if (!operation || !operation.type.includes('recurring')) {
                throw new Error(`Operación ${operationId} no es un pago recurrente`);
            }

            const result = await this.recurringService.executeRecurringPayment(operation.data.recurringId);

            this._updateOperationStatus(operationId, 'active', {
                lastPayment: result,
                lastExecuted: new Date()
            });

            return result;

        } catch (error) {
            console.error("❌ Error ejecutando pago recurrente:", error.message);
            throw error;
        }
    }

    /**
     * Inicia monitoreo automático de un pago recurrente
     */
    async startRecurringPaymentMonitor(operationId, intervalMs = 300000) { // 5 minutos por defecto
        try {
            const operation = this.operationsRegistry.get(operationId);
            if (!operation || !operation.type.includes('recurring')) {
                throw new Error(`Operación ${operationId} no es un pago recurrente`);
            }

            if (this.activeMonitors.has(operationId)) {
                console.log("⚠️  Monitor ya activo para esta operación");
                return;
            }

            console.log(`🔄 Iniciando monitor automático para pago recurrente ${operationId}`);

            const monitor = setInterval(async () => {
                try {
                    const status = this.recurringService.getRecurringPaymentStatus(operation.data.recurringId);

                    if (status.status === 'active') {
                        // Verificar si es momento de ejecutar el siguiente pago
                        const nextPaymentDate = new Date(status.nextPaymentDate);
                        if (nextPaymentDate <= new Date()) {
                            await this.executeNextRecurringPayment(operationId);
                        }
                    } else {
                        console.log(`🛑 Deteniendo monitor - pago recurrente ${operationId} no está activo`);
                        this.stopRecurringPaymentMonitor(operationId);
                    }
                } catch (error) {
                    console.error(`❌ Error en monitor de ${operationId}:`, error.message);
                }
            }, intervalMs);

            this.activeMonitors.set(operationId, monitor);
            console.log("✅ Monitor automático iniciado");

        } catch (error) {
            console.error("❌ Error iniciando monitor:", error.message);
            throw error;
        }
    }

    /**
     * Detiene el monitoreo automático de un pago recurrente
     */
    stopRecurringPaymentMonitor(operationId) {
        const monitor = this.activeMonitors.get(operationId);
        if (monitor) {
            clearInterval(monitor);
            this.activeMonitors.delete(operationId);
            console.log(`🛑 Monitor detenido para ${operationId}`);
        }
    }

    // ===== PAGOS DIVIDIDOS =====

    /**
     * Realiza un pago dividido entre múltiples receptores
     * @param {string} from - Wallet del pagador
     * @param {Array} recipients - Array de receptores con montos o porcentajes
     * @param {Object} [options] - Opciones adicionales
     */
    async sendSplitPayment(from, recipients, options = {}) {
        try {
            console.log(`💰 Enviando pago dividido desde ${from} a ${recipients.length} receptores`);

            const operationId = this._generateOperationId('split');

            const prepared = await this.splitService.prepareSplitPayment(from, recipients, options);

            let splitId;
            if (prepared.type === 'authorization_required') {
                this._registerOperation(operationId, 'split_pending_auth', 'pending_authorization', {
                    from,
                    recipients,
                    prepared
                });

                return {
                    operationId,
                    type: 'split_pending_auth',
                    authorizationUrl: prepared.authorizationUrl,
                    ...prepared
                };
            } else {
                splitId = prepared.splitPaymentId;
            }

            // Ejecutar el split payment
            const result = await this.splitService.executeSplitPayment(splitId);

            this._registerOperation(operationId, 'split_payment', 'completed', {
                from,
                recipients,
                splitId,
                result
            });

            console.log("✅ Pago dividido completado exitosamente");
            return { operationId, type: 'split_payment', ...result };

        } catch (error) {
            console.error("❌ Error en pago dividido:", error.message);
            throw error;
        }
    }

    /**
     * Método de conveniencia para distribución de comisiones por porcentajes
     */
    async distributeCommissions(from, baseAmount, commissionRules, options = {}) {
        try {
            console.log(`💼 Distribuyendo comisiones de $${baseAmount / 100}`);

            const recipients = commissionRules.map(rule => ({
                walletUrl: rule.walletUrl,
                type: "percentage",
                value: rule.percentage,
                baseAmount: baseAmount,
                description: rule.description || `Comisión ${rule.percentage}%`
            }));

            return await this.sendSplitPayment(from, recipients, options);

        } catch (error) {
            console.error("❌ Error distribuyendo comisiones:", error.message);
            throw error;
        }
    }

    // ===== PAGOS FUTUROS =====

    /**
     * Crea un "monedero virtual" para pagos futuros
     * @param {string} from - Wallet del pagador
     * @param {number} totalAmount - Monto total disponible
     * @param {Object} [options] - Opciones adicionales
     */
    async createPaymentWallet(from, totalAmount, options = {}) {
        try {
            console.log(`💳 Creando monedero de pagos por $${totalAmount / 100}`);

            const operationId = this._generateOperationId('wallet');

            const grantConfig = {
                totalAmount,
                description: options.description || "Monedero de pagos unificado",
                expiresAt: options.expiresAt
            };

            const prepared = await this.futureService.createFuturePaymentGrant(from, grantConfig);

            let grantId;
            if (prepared.type === 'authorization_required') {
                this._registerOperation(operationId, 'wallet_pending_auth', 'pending_authorization', {
                    from,
                    totalAmount,
                    grantConfig,
                    prepared
                });

                return {
                    operationId,
                    type: 'wallet_pending_auth',
                    authorizationUrl: prepared.authorizationUrl,
                    ...prepared
                };
            } else {
                grantId = prepared.grantId;
            }

            this._registerOperation(operationId, 'payment_wallet', 'active', {
                from,
                totalAmount,
                grantConfig,
                grantId
            });

            console.log("✅ Monedero de pagos creado exitosamente");
            return { operationId, type: 'payment_wallet', walletId: grantId, ...prepared };

        } catch (error) {
            console.error("❌ Error creando monedero de pagos:", error.message);
            throw error;
        }
    }

    /**
     * Realiza un pago usando un monedero existente
     */
    async payFromWallet(operationId, to, amount, options = {}) {
        try {
            const operation = this.operationsRegistry.get(operationId);
            if (!operation || operation.type !== 'payment_wallet') {
                throw new Error(`Operación ${operationId} no es un monedero de pagos válido`);
            }

            console.log(`💳 Pagando $${amount / 100} desde monedero ${operationId}`);

            const result = await this.futureService.executePaymentWithGrant(
                operation.data.grantId,
                to,
                amount,
                options
            );

            // Actualizar el registro de la operación
            this._updateOperationStatus(operationId, 'active', {
                lastPayment: result,
                totalUsed: (operation.data.totalUsed || 0) + amount
            });

            return result;

        } catch (error) {
            console.error("❌ Error pagando desde monedero:", error.message);
            throw error;
        }
    }

    /**
     * Programa un pago futuro usando un monedero
     */
    async schedulePaymentFromWallet(operationId, to, amount, scheduledDate, options = {}) {
        try {
            const operation = this.operationsRegistry.get(operationId);
            if (!operation || operation.type !== 'payment_wallet') {
                throw new Error(`Operación ${operationId} no es un monedero de pagos válido`);
            }

            console.log(`📅 Programando pago de $${amount / 100} para ${scheduledDate}`);

            const result = await this.futureService.schedulePayment(
                operation.data.grantId,
                to,
                amount,
                scheduledDate,
                options
            );

            return result;

        } catch (error) {
            console.error("❌ Error programando pago:", error.message);
            throw error;
        }
    }

    /**
     * Inicia monitor automático para pagos programados
     */
    startScheduledPaymentMonitor(intervalMs = 60000) { // 1 minuto por defecto
        if (this.activeMonitors.has('scheduled_payments')) {
            console.log("⚠️  Monitor de pagos programados ya activo");
            return;
        }

        console.log("⏰ Iniciando monitor global de pagos programados");

        const monitor = setInterval(async () => {
            try {
                await this.futureService.executeScheduledPayments();
            } catch (error) {
                console.error("❌ Error en monitor de pagos programados:", error.message);
            }
        }, intervalMs);

        this.activeMonitors.set('scheduled_payments', monitor);

        // Retornar función para detener
        return () => {
            this.stopScheduledPaymentMonitor();
        };
    }

    stopScheduledPaymentMonitor() {
        const monitor = this.activeMonitors.get('scheduled_payments');
        if (monitor) {
            clearInterval(monitor);
            this.activeMonitors.delete('scheduled_payments');
            console.log("🛑 Monitor de pagos programados detenido");
        }
    }

    // ===== MÉTODOS DE UTILIDAD =====

    /**
     * Completa operaciones que requieren autorización
     */
    async completeAuthorization(operationId) {
        try {
            const operation = this.operationsRegistry.get(operationId);
            if (!operation) {
                throw new Error(`Operación ${operationId} no encontrada`);
            }

            console.log(`🔐 Completando autorización para ${operationId}`);

            let result;

            switch (operation.type) {
                case 'recurring_pending_auth':
                    result = await this.recurringService.finalizeRecurringSetup(operation.data.prepared);
                    this._updateOperationStatus(operationId, 'active', {
                        recurringId: result.recurringPaymentId
                    });
                    break;

                case 'split_pending_auth':
                    result = await this.splitService.finalizeSplitPaymentSetup(operation.data.prepared);
                    const executionResult = await this.splitService.executeSplitPayment(result.splitPaymentId);
                    this._updateOperationStatus(operationId, 'completed', {
                        result: executionResult
                    });
                    result = executionResult;
                    break;

                case 'wallet_pending_auth':
                    result = await this.futureService.finalizeGrantSetup(operation.data.prepared);
                    this._updateOperationStatus(operationId, 'active', {
                        grantId: result.grantId
                    });
                    break;

                default:
                    throw new Error(`Tipo de operación no soportado para autorización: ${operation.type}`);
            }

            console.log("✅ Autorización completada exitosamente");
            return result;

        } catch (error) {
            console.error("❌ Error completando autorización:", error.message);
            throw error;
        }
    }

    /**
     * Obtiene el estado de cualquier operación
     */
    getOperationStatus(operationId) {
        const operation = this.operationsRegistry.get(operationId);
        if (!operation) {
            throw new Error(`Operación ${operationId} no encontrada`);
        }

        return {
            operationId,
            type: operation.type,
            status: operation.status,
            createdAt: operation.createdAt,
            updatedAt: operation.updatedAt,
            data: operation.data
        };
    }

    /**
     * Lista todas las operaciones activas
     */
    listActiveOperations() {
        const activeOps = [];

        for (const [id, operation] of this.operationsRegistry) {
            if (operation.status === 'active' || operation.status === 'pending_authorization') {
                activeOps.push({
                    operationId: id,
                    type: operation.type,
                    status: operation.status,
                    createdAt: operation.createdAt
                });
            }
        }

        return activeOps;
    }

    /**
     * Cancela una operación (si es posible)
     */
    async cancelOperation(operationId) {
        try {
            const operation = this.operationsRegistry.get(operationId);
            if (!operation) {
                throw new Error(`Operación ${operationId} no encontrada`);
            }

            console.log(`🛑 Cancelando operación ${operationId}`);

            // Detener monitors si existen
            if (this.activeMonitors.has(operationId)) {
                this.stopRecurringPaymentMonitor(operationId);
            }

            // Cancelar según el tipo
            switch (operation.type) {
                case 'recurring_payment':
                    await this.recurringService.cancelRecurringPayment(operation.data.recurringId);
                    break;

                case 'split_payment':
                    await this.splitService.cancelSplitPayment(operation.data.splitId);
                    break;

                case 'payment_wallet':
                    await this.futureService.revokeGrant(operation.data.grantId);
                    break;
            }

            this._updateOperationStatus(operationId, 'cancelled');

            console.log("✅ Operación cancelada exitosamente");

        } catch (error) {
            console.error("❌ Error cancelando operación:", error.message);
            throw error;
        }
    }

    /**
     * Limpia todas las operaciones completadas o canceladas
     */
    cleanupCompletedOperations() {
        let cleaned = 0;

        for (const [id, operation] of this.operationsRegistry) {
            if (operation.status === 'completed' || operation.status === 'cancelled') {
                this.operationsRegistry.delete(id);
                cleaned++;
            }
        }

        console.log(`🧹 Limpieza completada: ${cleaned} operaciones removidas`);
        return cleaned;
    }

    /**
     * Detiene todos los monitores activos
     */
    stopAllMonitors() {
        console.log("🛑 Deteniendo todos los monitores activos...");

        for (const [operationId, monitor] of this.activeMonitors) {
            clearInterval(monitor);
        }

        this.activeMonitors.clear();
        console.log("✅ Todos los monitores detenidos");
    }

    // Métodos privados
    _generateOperationId(prefix = 'op') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    _registerOperation(operationId, type, status, data) {
        this.operationsRegistry.set(operationId, {
            operationId,
            type,
            status,
            data,
            createdAt: new Date(),
            updatedAt: new Date()
        });
    }

    _updateOperationStatus(operationId, status, additionalData = {}) {
        const operation = this.operationsRegistry.get(operationId);
        if (operation) {
            operation.status = status;
            operation.updatedAt = new Date();
            Object.assign(operation.data, additionalData);
        }
    }

    async manageAuth(senderWallet, quote) {
        return await this.openPaymentService.manageAuth(senderWallet,quote);


    }
}

export function createUnifiedPaymentService(config) {
    return new UnifiedPaymentService(config);
}

export default UnifiedPaymentService;