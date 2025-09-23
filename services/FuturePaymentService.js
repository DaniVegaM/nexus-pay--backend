import { createOpenPaymentsService, DEFAULT_TEST_CONFIG } from "./ClientOpenPaymentsService.js";

/**
 * Servicio especializado para manejar pagos futuros y recurrentes
 * Permite crear grants de larga duración y ejecutar múltiples pagos
 */
class FuturePaymentService {
    constructor(config = DEFAULT_TEST_CONFIG) {
        this.openPaymentsService = createOpenPaymentsService(config);
        this.activeGrants = new Map(); // Grants activos para pagos futuros
        this.scheduledPayments = new Map(); // Pagos programados
    }

    /**
     * Crea un grant de larga duración para pagos futuros
     * @param {Object} grantRequest - Configuración del grant
     * @param {string} grantRequest.senderWalletUrl - URL del wallet del pagador
     * @param {Object} grantRequest.limits - Límites del grant
     * @param {number} grantRequest.limits.totalAmount - Monto total máximo
     * @param {string} [grantRequest.limits.interval] - Intervalo de renovación (formato ISO 8601)
     * @param {string} [grantRequest.expiresAt] - Fecha de expiración del grant
     * @param {string} [grantRequest.description] - Descripción del grant
     * @returns {Promise<Object>} Información del grant creado o pendiente de autorización
     */
    async createFuturePaymentGrant(grantRequest) {
        const grantId = this._generateGrantId();

        try {
            console.log(`🔐 [${grantId}] Creando grant para pagos futuros...`);

            // 1. Validar configuración
            this._validateGrantRequest(grantRequest);

            // 2. Obtener información del wallet sender
            const senderWallet = await this.openPaymentsService.getWalletAddress(grantRequest.senderWalletUrl);

            // 3. Preparar configuración del grant
            const grantLimits = this._buildGrantLimits(senderWallet, grantRequest.limits);
            const finishUri = this._buildFinishUri(grantId);
            console.log(grantLimits)

            // 4. Crear grant interactivo de larga duración
            const authFlow = await this.openPaymentsService.initiateAuthorizationFlow(
                senderWallet,
                grantLimits,
                finishUri
            );

            // 5. Guardar información de la sesión
            const grantSession = {
                grantId,
                status: 'authorization_pending',
                senderWallet,
                grantRequest,
                authFlow,
                totalAmount: grantRequest.limits.totalAmount,
                usedAmount: 0,
                reservedAmount: 0,
                createdAt: new Date().toISOString(),
                paymentHistory: []
            };

            this.activeGrants.set(grantId, grantSession);

            console.log(`✅ [${grantId}] Grant preparado - Autorización requerida`);

            return {
                grantId,
                status: 'authorization_pending',
                authorizationUrl: authFlow.redirectUrl,
                grantInfo: {
                    senderWallet: senderWallet.id,
                    totalAmount: grantRequest.limits.totalAmount,
                    interval: grantRequest.limits.interval,
                    expiresAt: grantRequest.expiresAt,
                    description: grantRequest.description
                },
                continueInfo: {
                    continueUri: authFlow.continueUri,
                    continueToken: authFlow.continueToken,
                    nonce: authFlow.nonce
                }
            };

        } catch (error) {
            console.error(`❌ [${grantId}] Error creando grant:`, error.message);

            // Guardar sesión con error para auditoría
            this.activeGrants.set(grantId, {
                grantId,
                status: 'failed',
                error: error.message,
                grantRequest,
                createdAt: new Date().toISOString()
            });

            throw new Error(`Future payment grant creation failed: ${error.message}`);
        }
    }

    /**
     * Finaliza la configuración del grant después de la autorización
     * @param {string} grantId - ID del grant
     * @param {string} interactRef - Referencia de interacción del callback
     * @param {string} [callbackHash] - Hash del callback para verificación
     * @returns {Promise<Object>} Grant finalizado y listo para usar
     */
    async finalizeGrantSetup(grantId, interactRef, callbackHash = null) {
        try {
            console.log(`🔄 [${grantId}] Finalizando configuración del grant...`);

            // 1. Recuperar sesión del grant
            const grantSession = this.activeGrants.get(grantId);
            if (!grantSession) {
                throw new Error('Grant session not found');
            }

            if (grantSession.status !== 'authorization_pending') {
                throw new Error(`Invalid grant status: ${grantSession.status}`);
            }

            // 2. Verificar hash si se proporciona
            if (callbackHash && grantSession.authFlow.nonce) {
                const isValidHash = this.openPaymentsService.verifyCallbackHash(
                    callbackHash,
                    grantSession.authFlow.nonce,
                    interactRef
                );
                if (!isValidHash) {
                    throw new Error('Invalid callback hash');
                }
            }

            // 3. Finalizar el grant
            const finalizedGrant = await this.openPaymentsService.completeAuthorizationFlow(
                grantSession.authFlow.continueUri,
                grantSession.authFlow.continueToken,
                interactRef
            );

            // 4. Actualizar sesión con grant finalizado
            const activeGrant = {
                ...grantSession,
                status: 'active',
                finalizedGrant,
                activatedAt: new Date().toISOString()
            };

            this.activeGrants.set(grantId, activeGrant);

            console.log(`✅ [${grantId}] Grant activado exitosamente`);

            return {
                grantId,
                status: 'active',
                grantInfo: {
                    senderWallet: grantSession.senderWallet.id,
                    totalAmount: grantSession.totalAmount,
                    usedAmount: 0,
                    remainingAmount: grantSession.totalAmount,
                    interval: grantSession.grantRequest.limits.interval,
                    expiresAt: grantSession.grantRequest.expiresAt,
                    description: grantSession.grantRequest.description,
                    activatedAt: activeGrant.activatedAt
                }
            };

        } catch (error) {
            console.error(`❌ [${grantId}] Error finalizando grant:`, error.message);

            // Marcar como fallido
            const session = this.activeGrants.get(grantId);
            if (session) {
                this.activeGrants.set(grantId, {
                    ...session,
                    status: 'failed',
                    error: error.message,
                    failedAt: new Date().toISOString()
                });
            }

            throw new Error(`Grant finalization failed: ${error.message}`);
        }
    }

    /**
     * Ejecuta un pago usando un grant de pagos futuros existente
     * @param {Object} paymentRequest - Datos del pago
     * @param {string} paymentRequest.grantId - ID del grant a usar
     * @param {string} paymentRequest.receiverWalletUrl - URL del wallet receptor
     * @param {string} paymentRequest.amount - Monto del pago
     * @param {string} [paymentRequest.description] - Descripción del pago
     * @returns {Promise<Object>} Resultado del pago ejecutado
     */
    async executePaymentWithGrant(paymentRequest) {
        const { grantId, receiverWalletUrl, amount, description } = paymentRequest;

        try {
            console.log(`💰 [${grantId}] Ejecutando pago de ${amount}...`);

            // 1. Validar grant
            const grant = this.activeGrants.get(grantId);
            if (!grant) {
                throw new Error('Grant not found');
            }

            if (grant.status !== 'active') {
                throw new Error(`Grant not active. Status: ${grant.status}`);
            }

            // 2. Verificar límites disponibles
            if (!this._canExecutePayment(grant, Number(amount))) {
                throw new Error(`Payment amount ${amount} exceeds available grant limits`);
            }

            // 3. Obtener información del wallet receptor
            const receiverWallet = await this.openPaymentsService.getWalletAddress(receiverWalletUrl);

            // 4. Crear incoming payment
            const incomingPayment = await this._createIncomingPayment(receiverWallet, amount, description);

            // 5. Crear quote
            const quote = await this._createQuote(grant.senderWallet, receiverWallet, incomingPayment.id);

            // 6. Ejecutar outgoing payment con el grant existente
            const outgoingPayment = await this.openPaymentsService.createOutgoingPayment(
                grant.senderWallet,
                grant.finalizedGrant,
                {
                    walletAddress: grant.senderWallet.id,
                    quoteId: quote.id
                }
            );

            // 7. Actualizar uso del grant
            const debitAmount = Number(quote.debitAmount.value);
            this._updateGrantUsage(grantId, debitAmount);

            // 8. Crear resultado del pago
            const paymentResult = {
                grantId,
                paymentId: outgoingPayment.id,
                executedAt: new Date().toISOString(),
                paymentDetails: {
                    sentAmount: outgoingPayment.sentAmount,
                    debitAmount: outgoingPayment.debitAmount,
                    receiveAmount: outgoingPayment.receiveAmount,
                    receiver: outgoingPayment.receiver,
                    description
                },
                transactionInfo: {
                    incomingPaymentId: incomingPayment.id,
                    outgoingPaymentId: outgoingPayment.id,
                    quoteId: quote.id
                },
                grantStatus: {
                    usedAmount: grant.usedAmount + debitAmount,
                    remainingAmount: this._getRemainingAmount(grantId)
                }
            };

            // 9. Agregar al historial
            this._addPaymentToHistory(grantId, paymentResult);

            console.log(`✅ [${grantId}] Pago ejecutado exitosamente`);

            return paymentResult;

        } catch (error) {
            console.error(`❌ [${grantId}] Error ejecutando pago:`, error.message);
            throw new Error(`Payment execution failed: ${error.message}`);
        }
    }

    /**
     * Programa un pago para ejecutarse en el futuro
     * @param {Object} scheduleRequest - Configuración del pago programado
     * @param {string} scheduleRequest.grantId - ID del grant a usar
     * @param {string} scheduleRequest.receiverWalletUrl - URL del wallet receptor
     * @param {string} scheduleRequest.amount - Monto del pago
     * @param {Date|string} scheduleRequest.scheduledAt - Fecha programada
     * @param {string} [scheduleRequest.description] - Descripción
     * @param {string} [scheduleRequest.recurringInterval] - Intervalo de recurrencia (ISO 8601)
     * @returns {Promise<Object>} Información del pago programado
     */
    async schedulePayment(scheduleRequest) {
        const scheduledPaymentId = this._generateScheduledPaymentId();

        try {
            console.log(`📅 [${scheduledPaymentId}] Programando pago para ${scheduleRequest.scheduledAt}...`);

            // 1. Validar request
            this._validateScheduleRequest(scheduleRequest);

            // 2. Validar grant
            const grant = this.activeGrants.get(scheduleRequest.grantId);
            if (!grant || grant.status !== 'active') {
                throw new Error('Grant not found or not active');
            }

            // 3. Verificar límites y reservar monto
            if (!this._canExecutePayment(grant, Number(scheduleRequest.amount))) {
                throw new Error(`Insufficient grant balance for scheduled payment`);
            }

            this._reserveAmount(scheduleRequest.grantId, Number(scheduleRequest.amount));

            // 4. Crear pago programado
            const scheduledPayment = {
                id: scheduledPaymentId,
                grantId: scheduleRequest.grantId,
                receiverWalletUrl: scheduleRequest.receiverWalletUrl,
                amount: Number(scheduleRequest.amount),
                scheduledAt: new Date(scheduleRequest.scheduledAt).toISOString(),
                description: scheduleRequest.description,
                recurringInterval: scheduleRequest.recurringInterval,
                status: 'scheduled',
                createdAt: new Date().toISOString(),
                attempts: 0,
                maxAttempts: 3
            };

            this.scheduledPayments.set(scheduledPaymentId, scheduledPayment);

            console.log(`✅ [${scheduledPaymentId}] Pago programado exitosamente`);

            return {
                scheduledPaymentId,
                grantId: scheduleRequest.grantId,
                status: 'scheduled',
                paymentInfo: {
                    amount: scheduledPayment.amount,
                    receiverWallet: scheduleRequest.receiverWalletUrl,
                    scheduledAt: scheduledPayment.scheduledAt,
                    description: scheduleRequest.description,
                    isRecurring: !!scheduleRequest.recurringInterval
                }
            };

        } catch (error) {
            console.error(`❌ [${scheduledPaymentId}] Error programando pago:`, error.message);
            throw new Error(`Payment scheduling failed: ${error.message}`);
        }
    }

    /**
     * Ejecuta todos los pagos programados que están listos
     * @returns {Promise<Array>} Resultados de las ejecuciones
     */
    async executeScheduledPayments() {
        try {
            console.log(`⏰ Verificando pagos programados listos...`);

            const now = new Date();
            const readyPayments = [];

            // Encontrar pagos listos para ejecutar
            for (const [id, payment] of this.scheduledPayments) {
                if (payment.status === 'scheduled' && new Date(payment.scheduledAt) <= now) {
                    readyPayments.push(payment);
                }
            }

            if (readyPayments.length === 0) {
                console.log(`✅ No hay pagos programados listos para ejecutar`);
                return [];
            }

            console.log(`⚡ Ejecutando ${readyPayments.length} pagos programados...`);

            const results = [];

            for (const scheduledPayment of readyPayments) {
                const result = await this._executeScheduledPayment(scheduledPayment);
                results.push(result);
            }

            const successful = results.filter(r => r.status === 'completed').length;
            console.log(`✅ Pagos programados procesados. Exitosos: ${successful}/${results.length}`);

            return results;

        } catch (error) {
            console.error(`❌ Error ejecutando pagos programados:`, error.message);
            throw error;
        }
    }

    /**
     * Cancela un pago programado
     * @param {string} scheduledPaymentId - ID del pago programado
     * @returns {Promise<boolean>} True si se canceló exitosamente
     */
    async cancelScheduledPayment(scheduledPaymentId) {
        try {
            console.log(`🛑 [${scheduledPaymentId}] Cancelando pago programado...`);

            const scheduledPayment = this.scheduledPayments.get(scheduledPaymentId);
            if (!scheduledPayment) {
                throw new Error('Scheduled payment not found');
            }

            if (!['scheduled', 'failed'].includes(scheduledPayment.status)) {
                throw new Error(`Cannot cancel payment with status: ${scheduledPayment.status}`);
            }

            // Liberar monto reservado
            this._unreserveAmount(scheduledPayment.grantId, scheduledPayment.amount);

            // Marcar como cancelado
            this._updateScheduledPaymentStatus(scheduledPaymentId, 'cancelled');

            console.log(`✅ [${scheduledPaymentId}] Pago programado cancelado`);
            return true;

        } catch (error) {
            console.error(`❌ [${scheduledPaymentId}] Error cancelando pago:`, error.message);
            throw error;
        }
    }

    /**
     * Revoca un grant activo
     * @param {string} grantId - ID del grant
     * @returns {Promise<void>}
     */
    async revokeGrant(grantId) {
        try {
            console.log(`🛑 [${grantId}] Revocando grant...`);

            const grant = this.activeGrants.get(grantId);
            if (!grant) {
                throw new Error('Grant not found');
            }

            // Cancelar pagos programados asociados
            const associatedPayments = this.listScheduledPayments(grantId);
            for (const payment of associatedPayments) {
                if (['scheduled', 'failed'].includes(payment.status)) {
                    await this.cancelScheduledPayment(payment.id);
                }
            }

            // Revocar grant en el servidor si es posible
            if (grant.finalizedGrant?.access_token?.manage) {
                await this.openPaymentsService.revokeGrant(
                    grant.finalizedGrant.access_token.manage,
                    grant.finalizedGrant.access_token.value
                );
            }

            // Marcar como revocado localmente
            this._updateGrantStatus(grantId, 'revoked');

            console.log(`✅ [${grantId}] Grant revocado exitosamente`);

        } catch (error) {
            console.error(`❌ [${grantId}] Error revocando grant:`, error.message);
            throw error;
        }
    }

    /**
     * Obtiene el estado completo de un grant
     */
    getGrantStatus(grantId) {
        const grant = this.activeGrants.get(grantId);
        if (!grant) return null;

        return {
            grantId: grant.grantId,
            status: grant.status,
            senderWallet: grant.senderWallet?.id,
            totalAmount: grant.totalAmount,
            usedAmount: grant.usedAmount,
            reservedAmount: grant.reservedAmount,
            remainingAmount: this._getRemainingAmount(grantId),
            createdAt: grant.createdAt,
            activatedAt: grant.activatedAt,
            expiresAt: grant.grantRequest?.expiresAt,
            description: grant.grantRequest?.description,
            interval: grant.grantRequest?.limits?.interval,
            paymentCount: grant.paymentHistory?.length || 0,
            lastPaymentAt: grant.paymentHistory?.length > 0 ?
                grant.paymentHistory[grant.paymentHistory.length - 1].executedAt : null
        };
    }

    /**
     * Lista pagos programados
     */
    listScheduledPayments(grantId = null) {
        const payments = [];

        for (const [id, payment] of this.scheduledPayments) {
            if (!grantId || payment.grantId === grantId) {
                payments.push({
                    id: payment.id,
                    grantId: payment.grantId,
                    receiverWalletUrl: payment.receiverWalletUrl,
                    amount: payment.amount,
                    scheduledAt: payment.scheduledAt,
                    status: payment.status,
                    description: payment.description,
                    isRecurring: !!payment.recurringInterval,
                    attempts: payment.attempts,
                    createdAt: payment.createdAt
                });
            }
        }

        return payments.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    }

    /**
     * Lista todos los grants activos
     */
    listActiveGrants() {
        const grants = [];

        for (const [grantId] of this.activeGrants) {
            const grantStatus = this.getGrantStatus(grantId);
            if (grantStatus && grantStatus.status === 'active') {
                grants.push(grantStatus);
            }
        }

        return grants;
    }

    /**
     * Inicia monitor automático para pagos programados
     */
    startScheduledPaymentMonitor(intervalMs = 60000) {
        console.log(`⏰ Iniciando monitor de pagos programados (cada ${intervalMs}ms)...`);

        const interval = setInterval(async () => {
            try {
                await this.executeScheduledPayments();
            } catch (error) {
                console.error(`❌ Error en monitor de pagos:`, error.message);
            }
        }, intervalMs);

        return () => {
            console.log(`🛑 Deteniendo monitor de pagos programados...`);
            clearInterval(interval);
        };
    }

    // ============= MÉTODOS PRIVADOS =============

    async _executeScheduledPayment(scheduledPayment) {
        const { id } = scheduledPayment;

        try {
            // Marcar como ejecutándose
            this._updateScheduledPaymentStatus(id, 'executing');
            scheduledPayment.attempts++;

            // Liberar reserva
            this._unreserveAmount(scheduledPayment.grantId, scheduledPayment.amount);

            // Ejecutar pago
            const result = await this.executePaymentWithGrant({
                grantId: scheduledPayment.grantId,
                receiverWalletUrl: scheduledPayment.receiverWalletUrl,
                amount: scheduledPayment.amount.toString(),
                description: scheduledPayment.description || `Scheduled payment ${id}`
            });

            // Marcar como completado
            this._updateScheduledPaymentStatus(id, 'completed');

            // Si es recurrente, programar siguiente pago
            if (scheduledPayment.recurringInterval) {
                await this._scheduleNextRecurringPayment(scheduledPayment);
            }

            return {
                scheduledPaymentId: id,
                status: 'completed',
                result
            };

        } catch (error) {
            console.error(`❌ [${id}] Error ejecutando pago programado:`, error.message);

            // Determinar si reintentar o marcar como fallido
            if (scheduledPayment.attempts < scheduledPayment.maxAttempts) {
                // Reservar monto nuevamente para reintento
                this._reserveAmount(scheduledPayment.grantId, scheduledPayment.amount);
                this._updateScheduledPaymentStatus(id, 'scheduled');

                // Reagendar para 5 minutos después
                const retryDate = new Date(Date.now() + 5 * 60 * 1000);
                scheduledPayment.scheduledAt = retryDate.toISOString();
            } else {
                this._updateScheduledPaymentStatus(id, 'failed', error.message);
            }

            return {
                scheduledPaymentId: id,
                status: 'failed',
                error: error.message,
                attempts: scheduledPayment.attempts
            };
        }
    }

    async _createIncomingPayment(receiverWallet, amount, description) {
        const incomingGrant = await this.openPaymentsService.createIncomingPaymentGrant(receiverWallet);

        const paymentData = {
            walletAddress: receiverWallet.id,
            incomingAmount: {
                assetCode: receiverWallet.assetCode,
                assetScale: receiverWallet.assetScale,
                value: amount.toString()
            }
        };

        if (description) {
            paymentData.description = description;
        }

        return await this.openPaymentsService.createIncomingPayment(
            receiverWallet,
            incomingGrant,
            paymentData
        );
    }

    async _createQuote(senderWallet, receiverWallet, incomingPaymentId) {
        const quoteGrant = await this.openPaymentsService.createQuoteGrant(senderWallet);

        return await this.openPaymentsService.createQuote(
            senderWallet.resourceServer,
            quoteGrant,
            {
                walletAddress: senderWallet.id,
                receiver: incomingPaymentId,
                method: "ilp"
            }
        );
    }

    _buildGrantLimits(senderWallet, limits) {
        const grantLimits = {
            debitAmount: {
                assetCode: senderWallet.assetCode,
                assetScale: senderWallet.assetScale,
                value: limits.totalAmount.toString()
            }
        };

        if (limits.interval) {
            grantLimits.interval = limits.interval;
        }

        return grantLimits;
    }

    _buildFinishUri(grantId) {
        return this.openPaymentsService.config.baseUrl ?
            `${this.openPaymentsService.config.baseUrl}/future-payment/callback/${grantId}` :
            `http://localhost:3000/future-payment/callback/${grantId}`;
    }

    _validateGrantRequest(request) {
        if (!request.senderWalletUrl) {
            throw new Error('Sender wallet URL is required');
        }

        if (!request.limits?.totalAmount || request.limits.totalAmount <= 0) {
            throw new Error('Valid total amount is required');
        }

        if (request.expiresAt && new Date(request.expiresAt) <= new Date()) {
            throw new Error('Expiration date must be in the future');
        }
    }

    _validateScheduleRequest(request) {
        if (!request.grantId || !request.receiverWalletUrl || !request.amount || !request.scheduledAt) {
            throw new Error('Grant ID, receiver wallet URL, amount, and scheduled date are required');
        }

        if (new Date(request.scheduledAt) <= new Date()) {
            throw new Error('Scheduled date must be in the future');
        }

        if (Number(request.amount) <= 0) {
            throw new Error('Amount must be greater than 0');
        }
    }

    async _scheduleNextRecurringPayment(completedPayment) {
        // Lógica simplificada para calcular próxima fecha basada en intervalo
        // En implementación real, usar librería como moment.js para parsing ISO 8601
        const nextDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // +1 día por simplicidad

        await this.schedulePayment({
            grantId: completedPayment.grantId,
            receiverWalletUrl: completedPayment.receiverWalletUrl,
            amount: completedPayment.amount.toString(),
            scheduledAt: nextDate,
            description: completedPayment.description,
            recurringInterval: completedPayment.recurringInterval
        });
    }

    // Métodos de utilidad para manejo de grants y pagos programados
    _canExecutePayment(grant, amount) {
        const available = grant.totalAmount - grant.usedAmount - grant.reservedAmount;
        return available >= amount && grant.status === 'active';
    }

    _updateGrantUsage(grantId, amount) {
        const grant = this.activeGrants.get(grantId);
        if (grant) {
            grant.usedAmount += amount;
            if (grant.usedAmount >= grant.totalAmount) {
                grant.status = 'exhausted';
            }
        }
    }

    _reserveAmount(grantId, amount) {
        const grant = this.activeGrants.get(grantId);
        if (grant) {
            grant.reservedAmount += amount;
        }
    }

    _unreserveAmount(grantId, amount) {
        const grant = this.activeGrants.get(grantId);
        if (grant) {
            grant.reservedAmount = Math.max(0, grant.reservedAmount - amount);
        }
    }

    _getRemainingAmount(grantId) {
        const grant = this.activeGrants.get(grantId);
        return grant ? grant.totalAmount - grant.usedAmount - grant.reservedAmount : 0;
    }

    _addPaymentToHistory(grantId, paymentResult) {
        const grant = this.activeGrants.get(grantId);
        if (grant) {
            grant.paymentHistory = grant.paymentHistory || [];
            grant.paymentHistory.push({
                executedAt: paymentResult.executedAt,
                amount: Number(paymentResult.paymentDetails.debitAmount.value),
                receiver: paymentResult.paymentDetails.receiver,
                description: paymentResult.paymentDetails.description,
                paymentId: paymentResult.paymentId
            });
        }
    }

    _updateGrantStatus(grantId, status) {
        const grant = this.activeGrants.get(grantId);
        if (grant) {
            grant.status = status;
        }
    }

    _updateScheduledPaymentStatus(id, status, errorMessage = null) {
        const payment = this.scheduledPayments.get(id);
        if (payment) {
            payment.status = status;
            payment.updatedAt = new Date().toISOString();
            if (errorMessage) {
                payment.errorMessage = errorMessage;
            }
        }
    }

    _generateGrantId() {
        return `future_grant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    _generateScheduledPaymentId() {
        return `scheduled_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

/**
 * Factory function para crear el servicio
 */
export function createFuturePaymentService(config) {
    return new FuturePaymentService(config);
}

export default FuturePaymentService;