import { createOpenPaymentsService, DEFAULT_TEST_CONFIG } from "./ClientOpenPaymentsService.js";

/**
 * Servicio especializado para manejar pagos únicos (one-time payments)
 * Proporciona una interfaz simplificada para el flujo completo de pagos
 */
class OneTimePaymentService {
    constructor(config = DEFAULT_TEST_CONFIG) {
        this.openPaymentsService = createOpenPaymentsService(config);
        this.paymentSessions = new Map(); // Almacena sesiones de pago
    }

    /**
     * Inicia un pago único - Paso 1: Preparación
     * @param {Object} paymentRequest - Datos del pago
     * @param {string} paymentRequest.senderWalletUrl - URL de billetera del remitente
     * @param {string} paymentRequest.receiverWalletUrl - URL de billetera del receptor
     * @param {string} paymentRequest.amount - Monto en la unidad más pequeña (ej: centavos)
     * @param {string} [paymentRequest.description] - Descripción del pago
     * @param {string} [paymentRequest.externalRef] - Referencia externa
     * @returns {Promise<Object>} Información del pago preparado
     */
    async initiatePayment(paymentRequest) {
        const sessionId = this.openPaymentsService.generateSessionId();

        try {
            console.log(`🚀 [${sessionId}] Iniciando pago único...`);

            // 1. Validar parámetros
            this._validatePaymentRequest(paymentRequest);

            // 2. Obtener información de wallets
            console.log(`📋 [${sessionId}] Obteniendo información de wallets...`);
            const [senderWallet, receiverWallet] = await this.openPaymentsService.getMultipleWalletAddresses([
                paymentRequest.senderWalletUrl,
                paymentRequest.receiverWalletUrl
            ]);

            // 3. Crear incoming payment
            const incomingPayment = await this._createIncomingPayment(
                receiverWallet,
                paymentRequest.amount,
                paymentRequest.description
            );

            // 4. Crear quote
            const quote = await this._createQuote(senderWallet, receiverWallet, incomingPayment.id);

            // 5. Iniciar flujo de autorización para outgoing payment
            const authFlow = await this._initiateAuthorizationFlow(
                senderWallet,
                quote,
                sessionId
            );

            // 6. Guardar sesión de pago
            const paymentSession = {
                sessionId,
                status: 'authorization_pending',
                senderWallet,
                receiverWallet,
                incomingPayment,
                quote,
                authFlow,
                paymentRequest,
                createdAt: new Date().toISOString()
            };

            this.paymentSessions.set(sessionId, paymentSession);

            console.log(`✅ [${sessionId}] Pago iniciado - Autorización requerida`);

            return {
                sessionId,
                status: 'authorization_pending',
                authorizationUrl: authFlow.redirectUrl,
                paymentInfo: {
                    senderWallet: senderWallet.id,
                    receiverWallet: receiverWallet.id,
                    requestedAmount: {
                        value: paymentRequest.amount,
                        assetCode: receiverWallet.assetCode,
                        assetScale: receiverWallet.assetScale
                    },
                    quotedAmount: quote.debitAmount,
                    estimatedReceiveAmount: quote.receiveAmount
                }
            };

        } catch (error) {
            console.error(`❌ [${sessionId}] Error iniciando pago:`, error.message);

            // Guardar sesión con error para auditoría
            this.paymentSessions.set(sessionId, {
                sessionId,
                status: 'failed',
                error: error.message,
                paymentRequest,
                createdAt: new Date().toISOString()
            });

            throw new Error(`Payment initiation failed: ${error.message}`);
        }
    }

    /**
     * Completa un pago después de la autorización - Paso 2: Finalización
     * @param {string} sessionId - ID de la sesión de pago
     * @param {string} interactRef - Referencia de interacción del callback
     * @param {string} [callbackHash] - Hash del callback para verificación
     * @returns {Promise<Object>} Resultado del pago completado
     */
    async completePayment(sessionId, interactRef, callbackHash = null) {
        try {
            console.log(`🔄 [${sessionId}] Completando pago...`);

            // 1. Recuperar sesión de pago
            const paymentSession = this.paymentSessions.get(sessionId);
            if (!paymentSession) {
                throw new Error('Payment session not found');
            }

            if (paymentSession.status !== 'authorization_pending') {
                throw new Error(`Invalid payment status: ${paymentSession.status}`);
            }

            // 2. Verificar hash del callback si se proporciona
            if (callbackHash && paymentSession.authFlow.nonce) {
                const isValidHash = this.openPaymentsService.verifyCallbackHash(
                    callbackHash,
                    paymentSession.authFlow.nonce,
                    interactRef
                );
                if (!isValidHash) {
                    throw new Error('Invalid callback hash');
                }
            }

            // 3. Completar flujo de autorización
            console.log(`🔐 [${sessionId}] Finalizando autorización...`);
            const finalizedGrant = await this.openPaymentsService.completeAuthorizationFlow(
                paymentSession.authFlow.continueUri,
                paymentSession.authFlow.continueToken,
                interactRef
            );

            // 4. Crear outgoing payment
            console.log(`📤 [${sessionId}] Ejecutando pago...`);
            const outgoingPayment = await this.openPaymentsService.createOutgoingPayment(
                paymentSession.senderWallet,
                finalizedGrant,
                {
                    walletAddress: paymentSession.senderWallet.id,
                    quoteId: paymentSession.quote.id
                }
            );

            // 5. Actualizar sesión
            const completedSession = {
                ...paymentSession,
                status: 'completed',
                finalizedGrant,
                outgoingPayment,
                completedAt: new Date().toISOString()
            };

            this.paymentSessions.set(sessionId, completedSession);

            console.log(`✅ [${sessionId}] Pago completado exitosamente`);

            return {
                sessionId,
                status: 'completed',
                paymentId: outgoingPayment.id,
                paymentDetails: {
                    sentAmount: outgoingPayment.sentAmount,
                    debitAmount: outgoingPayment.debitAmount,
                    receiveAmount: outgoingPayment.receiveAmount,
                    receiver: outgoingPayment.receiver,
                    createdAt: outgoingPayment.createdAt
                },
                transactionInfo: {
                    incomingPaymentId: paymentSession.incomingPayment.id,
                    quoteId: paymentSession.quote.id,
                    outgoingPaymentId: outgoingPayment.id
                }
            };

        } catch (error) {
            console.error(`❌ [${sessionId}] Error completando pago:`, error.message);

            // Actualizar sesión con error
            const session = this.paymentSessions.get(sessionId);
            if (session) {
                this.paymentSessions.set(sessionId, {
                    ...session,
                    status: 'failed',
                    error: error.message,
                    failedAt: new Date().toISOString()
                });
            }

            throw new Error(`Payment completion failed: ${error.message}`);
        }
    }

    /**
     * Obtiene el estado de un pago
     * @param {string} sessionId - ID de la sesión
     * @returns {Object|null} Estado del pago
     */
    getPaymentStatus(sessionId) {
        const session = this.paymentSessions.get(sessionId);
        if (!session) return null;

        return {
            sessionId: session.sessionId,
            status: session.status,
            createdAt: session.createdAt,
            completedAt: session.completedAt,
            failedAt: session.failedAt,
            error: session.error,
            paymentInfo: session.paymentRequest ? {
                senderWallet: session.senderWallet?.id,
                receiverWallet: session.receiverWallet?.id,
                amount: session.paymentRequest.amount,
                description: session.paymentRequest.description
            } : null,
            transactionIds: session.outgoingPayment ? {
                incomingPaymentId: session.incomingPayment?.id,
                outgoingPaymentId: session.outgoingPayment?.id,
                quoteId: session.quote?.id
            } : null
        };
    }

    /**
     * Cancela un pago pendiente
     * @param {string} sessionId - ID de la sesión
     * @returns {Promise<boolean>} True si se canceló exitosamente
     */
    async cancelPayment(sessionId) {
        try {
            const session = this.paymentSessions.get(sessionId);
            if (!session) return false;

            if (session.status === 'completed') {
                throw new Error('Cannot cancel completed payment');
            }

            // Si hay un grant activo, revocarlo
            if (session.finalizedGrant?.access_token?.manage) {
                await this.openPaymentsService.revokeGrant(
                    session.finalizedGrant.access_token.manage,
                    session.finalizedGrant.access_token.value
                );
            }

            // Marcar como cancelado
            this.paymentSessions.set(sessionId, {
                ...session,
                status: 'cancelled',
                cancelledAt: new Date().toISOString()
            });

            console.log(`🚫 [${sessionId}] Pago cancelado`);
            return true;

        } catch (error) {
            console.error(`❌ [${sessionId}] Error cancelando pago:`, error.message);
            throw error;
        }
    }

    /**
     * Limpia sesiones de pago expiradas (utility para mantenimiento)
     * @param {number} maxAgeHours - Edad máxima en horas
     * @returns {number} Número de sesiones eliminadas
     */
    cleanExpiredSessions(maxAgeHours = 24) {
        const cutoffTime = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
        let cleaned = 0;

        for (const [sessionId, session] of this.paymentSessions.entries()) {
            const sessionTime = new Date(session.createdAt);
            if (sessionTime < cutoffTime && session.status !== 'completed') {
                this.paymentSessions.delete(sessionId);
                cleaned++;
            }
        }

        console.log(`🧹 Limpiadas ${cleaned} sesiones expiradas`);
        return cleaned;
    }

    // ============= MÉTODOS PRIVADOS AUXILIARES =============

    /**
     * Valida la solicitud de pago
     */
    _validatePaymentRequest(request) {
        if (!request.senderWalletUrl || !request.receiverWalletUrl) {
            throw new Error('Sender and receiver wallet URLs are required');
        }

        if (!request.amount || isNaN(request.amount) || Number(request.amount) <= 0) {
            throw new Error('Valid amount is required');
        }
    }

    /**
     * Crea el incoming payment
     */
    async _createIncomingPayment(receiverWallet, amount, description = null) {
        console.log(`📥 Creando incoming payment...`);

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

    /**
     * Crea la cotización
     */
    async _createQuote(senderWallet, receiverWallet, incomingPaymentId) {
        console.log(`💰 Creando quote...`);

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

    /**
     * Inicia el flujo de autorización
     */
    async _initiateAuthorizationFlow(senderWallet, quote, sessionId) {
        console.log(`🔐 Iniciando flujo de autorización...`);

        const finishUri = this.openPaymentsService.config.baseUrl ?
            `${this.openPaymentsService.config.baseUrl}/payment/callback/${sessionId}` :
            `http://localhost:3000/payment/callback/${sessionId}`;

        return await this.openPaymentsService.initiateAuthorizationFlow(
            senderWallet,
            { debitAmount: quote.debitAmount },
            finishUri
        );
    }
}

/**
 * Factory function para crear el servicio
 */
export function createOneTimePaymentService(config) {
    return new OneTimePaymentService(config);
}

export default OneTimePaymentService;