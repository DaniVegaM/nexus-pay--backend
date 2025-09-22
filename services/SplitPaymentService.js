import { createOpenPaymentsService, DEFAULT_TEST_CONFIG } from "./ClientOpenPaymentsService.js";
import {isFinalizedGrant} from "@interledger/open-payments";

/**
 * Servicio especializado para manejar pagos divididos (split payments)
 * Permite dividir un pago entre múltiples receptores con diferentes estrategias
 */
const _sleep = (ms) => new Promise(r => setTimeout(r, ms));

class SplitPaymentService {
    constructor(config = DEFAULT_TEST_CONFIG) {
        this.openPaymentsService = createOpenPaymentsService(config);
        this.splitPayments = new Map(); // Configuraciones de pagos divididos
    }

    /**
     * Crea un pago dividido con múltiples receptores
     * @param {Object} splitRequest - Configuración del split payment
     * @param {string} splitRequest.senderWalletUrl - URL del wallet pagador
     * @param {Array} splitRequest.recipients - Array de receptores
     * @param {Object} splitRequest.recipients[].walletUrl - URL del wallet receptor
     * @param {string} splitRequest.recipients[].type - Tipo: 'fixed', 'percentage', 'remaining'
     * @param {number} splitRequest.recipients[].value - Valor (monto fijo o porcentaje)
     * @param {string} [splitRequest.recipients[].description] - Descripción del pago
     * @param {number} [splitRequest.recipients[].priority] - Prioridad de ejecución (1-10)
     * @param {Object} [splitRequest.execution] - Configuración de ejecución
     * @param {boolean} [splitRequest.execution.parallel=true] - Ejecución en paralelo
     * @param {boolean} [splitRequest.execution.stopOnError=false] - Parar si hay error
     * @param {number} [splitRequest.execution.maxConcurrent=5] - Máximo pagos simultáneos
     * @param {string} [splitRequest.totalAmount] - Monto total base para cálculos de porcentaje
     * @param {string} [splitRequest.description] - Descripción del split payment
     * @returns {Promise<Object>} Información del split payment creado
     */
    async createSplitPayment(splitRequest) {
        const splitId = this._generateSplitId();

        try {
            console.log(`💰 [${splitId}] Creando split payment...`);

            // 1. Validar configuración
            this._validateSplitRequest(splitRequest);

            // 2. Obtener información del wallet sender
            const senderWallet = await this.openPaymentsService.getWalletAddress(splitRequest.senderWalletUrl);

            // 3. Procesar y validar receptores
            const processedRecipients = await this._processRecipients(
                splitRequest.recipients,
                splitRequest.totalAmount,
                senderWallet
            );

            // 4. Calcular monto total necesario
            const totalAmount = this._calculateTotalAmount(processedRecipients);

            // 5. Preparar límites del grant
            const grantLimits = {
                debitAmount: {
                    assetCode: senderWallet.assetCode,
                    assetScale: senderWallet.assetScale,
                    value: totalAmount.toString()
                }
            };

            const finishUri = this._buildFinishUri(splitId);

            // 6. Crear grant interactivo
            const authFlow = await this.openPaymentsService.initiateAuthorizationFlow(
                senderWallet,
                grantLimits,
                finishUri
            );

            // 7. Guardar configuración del split payment
            const splitPayment = {
                splitId,
                status: 'authorization_pending',
                senderWallet,
                recipients: processedRecipients,
                totalAmount,
                splitRequest,
                authFlow,
                createdAt: new Date().toISOString(),
                executionResults: []
            };

            this.splitPayments.set(splitId, splitPayment);

            console.log(`✅ [${splitId}] Split payment creado - Autorización requerida`);

            return {
                splitId,
                status: 'authorization_pending',
                authorizationUrl: authFlow.redirectUrl,
                splitInfo: {
                    senderWallet: senderWallet.id,
                    totalAmount,
                    recipientCount: processedRecipients.length,
                    recipients: processedRecipients.map(r => ({
                        walletUrl: r.walletUrl,
                        type: r.type,
                        amount: r.calculatedAmount,
                        description: r.description,
                        priority: r.priority
                    })),
                    executionConfig: splitRequest.execution || {},
                    description: splitRequest.description
                },
                continueInfo: {
                    continueUri: authFlow.continueUri,
                    continueToken: authFlow.continueToken,
                    nonce: authFlow.nonce
                }
            };

        } catch (error) {
            console.error(`❌ [${splitId}] Error creando split payment:`, error.message);

            // Guardar sesión con error
            this.splitPayments.set(splitId, {
                splitId,
                status: 'failed',
                error: error.message,
                splitRequest,
                createdAt: new Date().toISOString()
            });

            throw new Error(`Split payment creation failed: ${error.message}`);
        }
    }

    /**
     * Finaliza la configuración del split payment después de la autorización
     * @param {string} splitId - ID del split payment
     * @param {string} interactRef - Referencia de interacción del callback
     * @param {string} [callbackHash] - Hash del callback para verificación
     * @returns {Promise<Object>} Split payment listo para ejecutar
     */
    async activateSplitPayment(splitId, interactRef, callbackHash = null) {
        try {
            console.log(`🔄 [${splitId}] Activando split payment...`);

            // 1. Recuperar configuración
            const splitPayment = this.splitPayments.get(splitId);
            if (!splitPayment) {
                throw new Error('Split payment not found');
            }

            if (splitPayment.status !== 'authorization_pending') {
                throw new Error(`Invalid split payment status: ${splitPayment.status}`);
            }

            // 2. Verificar hash si se proporciona
            if (callbackHash && splitPayment.authFlow.nonce) {
                const isValidHash = this.openPaymentsService.verifyCallbackHash(
                    callbackHash,
                    splitPayment.authFlow.nonce,
                    interactRef
                );
                if (!isValidHash) {
                    throw new Error('Invalid callback hash');
                }
            }

            // 3. Finalizar grant
            const finalizedGrant = await this.openPaymentsService.completeAuthorizationFlow(
                splitPayment.authFlow.continueUri,
                splitPayment.authFlow.continueToken,
                interactRef
            );

            // 4. Activar split payment
            const activeSplit = {
                ...splitPayment,
                status: 'ready',
                finalizedGrant,
                activatedAt: new Date().toISOString()
            };

            this.splitPayments.set(splitId, activeSplit);

            console.log(`✅ [${splitId}] Split payment activado y listo para ejecutar`);

            return {
                splitId,
                status: 'ready',
                splitInfo: {
                    senderWallet: activeSplit.senderWallet.id,
                    totalAmount: activeSplit.totalAmount,
                    recipientCount: activeSplit.recipients.length,
                    activatedAt: activeSplit.activatedAt
                }
            };

        } catch (error) {
            console.error(`❌ [${splitId}] Error activando split payment:`, error.message);

            // Marcar como fallido
            const split = this.splitPayments.get(splitId);
            if (split) {
                this.splitPayments.set(splitId, {
                    ...split,
                    status: 'failed',
                    error: error.message,
                    failedAt: new Date().toISOString()
                });
            }

            throw new Error(`Split payment activation failed: ${error.message}`);
        }
    }

    /**
     * Ejecuta el split payment completo
     * @param {string} splitId - ID del split payment
     * @returns {Promise<Object>} Resultado de la ejecución
     */
    async executeSplitPayment(splitId) {
        try {
            console.log(`💸 [${splitId}] Ejecutando split payment...`);

            // 1. Validar split payment
            const splitPayment = this.splitPayments.get(splitId);
            if (!splitPayment) {
                throw new Error('Split payment not found');
            }

            if (splitPayment.status !== 'ready') {
                throw new Error(`Split payment not ready. Status: ${splitPayment.status}`);
            }

            // 2. Marcar como ejecutándose
            this._updateSplitPaymentState(splitId, {
                status: 'executing',
                executionStartedAt: new Date().toISOString()
            });

            // 3. Organizar receptores por prioridad
            const sortedRecipients = this._sortRecipientsByPriority(splitPayment.recipients);

            // 4. Ejecutar según configuración
            const executionConfig = splitPayment.splitRequest.execution || {};
            let results;

            if (executionConfig.parallel !== false) {
                results = await this._executeInParallel(splitPayment, sortedRecipients, executionConfig);
            } else {
                results = await this._executeSequentially(splitPayment, sortedRecipients, executionConfig);
            }

            // 5. Procesar resultados finales
            const successful = results.filter(r => r.status === 'completed');
            const failed = results.filter(r => r.status === 'failed');

            const finalStatus = failed.length === 0 ? 'completed' :
                successful.length > 0 ? 'partially_completed' : 'failed';

            // 6. Actualizar estado final
            this._updateSplitPaymentState(splitId, {
                status: finalStatus,
                executionResults: results,
                executionCompletedAt: new Date().toISOString(),
                successfulPayments: successful.length,
                failedPayments: failed.length
            });

            console.log(`✅ [${splitId}] Split payment completado - Exitosos: ${successful.length}, Fallidos: ${failed.length}`);

            return {
                splitId,
                status: finalStatus,
                executionSummary: {
                    totalRecipients: sortedRecipients.length,
                    successfulPayments: successful.length,
                    failedPayments: failed.length,
                    totalAmount: splitPayment.totalAmount,
                    executionTime: Date.now() - new Date(splitPayment.executionStartedAt).getTime()
                },
                results: {
                    successful,
                    failed
                }
            };

        } catch (error) {
            console.error(`❌ [${splitId}] Error ejecutando split payment:`, error.message);

            // Marcar como fallido
            this._updateSplitPaymentState(splitId, {
                status: 'failed',
                error: error.message,
                failedAt: new Date().toISOString()
            });

            throw new Error(`Split payment execution failed: ${error.message}`);
        }
    }


    /**
     * Reintenta pagos fallidos específicos
     * @param {string} splitId - ID del split payment
     * @param {Array<number>} [failedIndexes] - Índices de pagos fallidos a reintentar
     * @returns {Promise<Object>} Resultado de los reintentos
     */
    async retryFailedPayments(splitId, failedIndexes = null) {
        try {
            console.log(`🔄 [${splitId}] Reintentando pagos fallidos...`);

            const splitPayment = this.splitPayments.get(splitId);
            if (!splitPayment) {
                throw new Error('Split payment not found');
            }

            if (!splitPayment.executionResults) {
                throw new Error('No execution results found');
            }

            // Identificar pagos fallidos
            const failedResults = splitPayment.executionResults.filter(r => r.status === 'failed');
            if (failedResults.length === 0) {
                return { message: 'No failed payments to retry', results: [] };
            }

            // Seleccionar pagos a reintentar
            const toRetry = failedIndexes ?
                failedResults.filter((_, index) => failedIndexes.includes(index)) :
                failedResults;

            console.log(`🔄 [${splitId}] Reintentando ${toRetry.length} pagos...`);

            const retryResults = [];

            for (const failedResult of toRetry) {
                try {
                    const recipient = splitPayment.recipients.find(r => r.walletUrl === failedResult.recipient.walletUrl);
                    if (!recipient) {
                        throw new Error('Recipient not found for retry');
                    }

                    const result = await this._executeIndividualPayment(splitPayment, recipient);
                    retryResults.push({
                        ...result,
                        isRetry: true,
                        originalError: failedResult.error
                    });

                    // Actualizar resultado en el split payment
                    const originalIndex = splitPayment.executionResults.findIndex(
                        r => r.recipient.walletUrl === failedResult.recipient.walletUrl
                    );
                    if (originalIndex !== -1) {
                        splitPayment.executionResults[originalIndex] = result;
                    }

                } catch (error) {
                    retryResults.push({
                        recipient: { walletUrl: failedResult.recipient.walletUrl },
                        status: 'failed',
                        error: error.message,
                        isRetry: true,
                        retryFailedAt: new Date().toISOString()
                    });
                }
            }

            // Actualizar estadísticas
            const newSuccessful = retryResults.filter(r => r.status === 'completed');
            const currentSuccessful = splitPayment.executionResults.filter(r => r.status === 'completed').length;
            const currentFailed = splitPayment.executionResults.filter(r => r.status === 'failed').length;

            this._updateSplitPaymentState(splitId, {
                successfulPayments: currentSuccessful + newSuccessful.length,
                failedPayments: currentFailed - newSuccessful.length,
                lastRetryAt: new Date().toISOString()
            });

            console.log(`✅ [${splitId}] Reintentos completados - Exitosos: ${newSuccessful.length}/${toRetry.length}`);

            return {
                splitId,
                retryResults,
                summary: {
                    retriedCount: toRetry.length,
                    newSuccessful: newSuccessful.length,
                    stillFailed: toRetry.length - newSuccessful.length
                }
            };

        } catch (error) {
            console.error(`❌ [${splitId}] Error en reintentos:`, error.message);
            throw error;
        }
    }

    /**
     * Obtiene el estado completo de un split payment
     */
    getSplitPaymentStatus(splitId) {
        const split = this.splitPayments.get(splitId);
        if (!split) return null;

        return {
            splitId: split.splitId,
            status: split.status,
            senderWallet: split.senderWallet?.id,
            totalAmount: split.totalAmount,
            recipientCount: split.recipients?.length || 0,
            successfulPayments: split.successfulPayments || 0,
            failedPayments: split.failedPayments || 0,
            createdAt: split.createdAt,
            activatedAt: split.activatedAt,
            executionStartedAt: split.executionStartedAt,
            executionCompletedAt: split.executionCompletedAt,
            description: split.splitRequest?.description,
            executionConfig: split.splitRequest?.execution || {},
            recipients: split.recipients?.map(r => ({
                walletUrl: r.walletUrl,
                type: r.type,
                amount: r.calculatedAmount,
                description: r.description,
                priority: r.priority,
                status: this._getRecipientStatus(split, r.walletUrl)
            })) || []
        };
    }

    /**
     * Lista todos los split payments
     */
    listSplitPayments(status = null) {
        const payments = [];

        for (const [splitId] of this.splitPayments) {
            const paymentStatus = this.getSplitPaymentStatus(splitId);
            if (paymentStatus && (!status || paymentStatus.status === status)) {
                payments.push(paymentStatus);
            }
        }

        return payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    /**
     * Cancela un split payment
     */
    async cancelSplitPayment(splitId) {
        try {
            console.log(`🛑 [${splitId}] Cancelando split payment...`);

            const splitPayment = this.splitPayments.get(splitId);
            if (!splitPayment) {
                throw new Error('Split payment not found');
            }

            if (['completed', 'executing'].includes(splitPayment.status)) {
                throw new Error(`Cannot cancel split payment with status: ${splitPayment.status}`);
            }

            // Revocar grant si es posible
            if (splitPayment.finalizedGrant?.access_token?.manage) {
                await this.openPaymentsService.revokeGrant(
                    splitPayment.finalizedGrant.access_token.manage,
                    splitPayment.finalizedGrant.access_token.value
                );
            }

            this._updateSplitPaymentState(splitId, {
                status: 'cancelled',
                cancelledAt: new Date().toISOString()
            });

            console.log(`✅ [${splitId}] Split payment cancelado`);

        } catch (error) {
            console.error(`❌ [${splitId}] Error cancelando split payment:`, error.message);
            throw error;
        }
    }

    // ============= MÉTODOS PRIVADOS =============

    async _processRecipients(recipients, totalAmount, senderWallet) {
        const processed = [];
        let remainingAmount = totalAmount ? Number(totalAmount) : 0;
        const baseAmount = remainingAmount;

        // Procesar por prioridad: fixed amounts primero, luego percentages, finalmente remaining
        const sortedByType = [...recipients].sort((a, b) => {
            const typeOrder = { 'fixed': 1, 'percentage': 2, 'remaining': 3 };
            return typeOrder[a.type] - typeOrder[b.type];
        });

        for (const recipient of sortedByType) {
            // Obtener wallet del receptor
            const recipientWallet = await this.openPaymentsService.getWalletAddress(recipient.walletUrl);

            let calculatedAmount;

            switch (recipient.type) {
                case 'fixed':
                    calculatedAmount = Number(recipient.value);
                    remainingAmount -= calculatedAmount;
                    break;

                case 'percentage':
                    if (!baseAmount) {
                        throw new Error('Total amount required for percentage calculations');
                    }
                    calculatedAmount = Math.floor((baseAmount * Number(recipient.value)) / 100);
                    remainingAmount -= calculatedAmount;
                    break;

                case 'remaining':
                    calculatedAmount = Math.max(0, remainingAmount);
                    remainingAmount = 0;
                    break;

                default:
                    throw new Error(`Invalid recipient type: ${recipient.type}`);
            }

            if (calculatedAmount <= 0) {
                throw new Error(`Invalid amount calculated for recipient ${recipient.walletUrl}: ${calculatedAmount}`);
            }

            processed.push({
                ...recipient,
                recipientWallet,
                calculatedAmount,
                priority: recipient.priority || 5
            });
        }

        // Validar que no hay monto negativo restante
        if (remainingAmount < 0) {
            throw new Error(`Total recipient amounts exceed available funds by ${Math.abs(remainingAmount)}`);
        }

        return processed;
    }

    async _executeInParallel(splitPayment, recipients, config) {
        const maxConcurrent = config.maxConcurrent || 5;
        const stopOnError = config.stopOnError || false;
        const results = [];

        // Ejecutar en lotes para controlar concurrencia
        for (let i = 0; i < recipients.length; i += maxConcurrent) {
            const batch = recipients.slice(i, i + maxConcurrent);

            const batchPromises = batch.map(recipient =>
                this._executeIndividualPayment(splitPayment, recipient)
                    .catch(error => ({
                        recipient: { walletUrl: recipient.walletUrl },
                        status: 'failed',
                        error: error.message,
                        failedAt: new Date().toISOString()
                    }))
            );

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

            // Si hay errores y stopOnError está habilitado, detener
            if (stopOnError && batchResults.some(r => r.status === 'failed')) {
                console.log(`🛑 [${splitPayment.splitId}] Deteniendo ejecución por error`);
                break;
            }
        }

        return results;
    }

    async _executeSequentially(splitPayment, recipients, config) {
        const stopOnError = config.stopOnError || false;
        const results = [];

        for (const recipient of recipients) {
            try {
                const result = await this._executeIndividualPayment(splitPayment, recipient);
                results.push(result);
            } catch (error) {
                const failedResult = {
                    recipient: { walletUrl: recipient.walletUrl },
                    status: 'failed',
                    error: error.message,
                    failedAt: new Date().toISOString()
                };
                results.push(failedResult);

                if (stopOnError) {
                    console.log(`🛑 [${splitPayment.splitId}] Deteniendo ejecución secuencial por error`);
                    break;
                }
            }
        }

        return results;
    }

    async _executeIndividualPayment(splitPayment, recipient) {
        try {
            console.log(`💸 [${splitPayment.splitId}] Pagando a ${recipient.walletUrl}: ${recipient.calculatedAmount}`);

            // 1) Crear incoming en el RS del receptor (y obtener su grant)
            const { incomingPayment, incomingGrant } = await this._createIncomingPayment(
                recipient.recipientWallet,
                recipient.calculatedAmount.toString(),
            );

            console.log("incomingPayment:-------------");
            console.log(incomingPayment);

            // 2) Crear quote en el RS del receptor (tu monto ya lo pasas correcto: 15000/30000)
            let quote = await this._createQuote(
                splitPayment.senderWallet,
                recipient.recipientWallet,
                incomingPayment.id,
                recipient.calculatedAmount.toString() // sigues enviando el valor que ya ajustaste (ej. "15000")
            );
            console.log("quote:-------------");
            console.log(quote);


            // 3) Crear outgoing desde el sender
            const outgoingPayment = await this.openPaymentsService.createOutgoingPayment(
                splitPayment.senderWallet,
                splitPayment.finalizedGrant,
                {
                    walletAddress: splitPayment.senderWallet.id,
                    quoteId: quote.id,

                }
            );

            const isCrossAsset =
                splitPayment.senderWallet.assetCode !== recipient.recipientWallet.assetCode ||
                splitPayment.senderWallet.assetScale !== recipient.recipientWallet.assetScale;

            if (isCrossAsset) {
                await _sleep(1500); // pequeña "gracia" inicial en cross-asset
            }

            // 4) Releer el incoming (2–3 intentos) para ver el recibido > 0
            let latest = null;
            for (let i = 0; i < 3; i++) {
                await _sleep(1000);
                latest = await this.openPaymentsService.getIncomingPayment(
                    recipient.recipientWallet.resourceServer,
                    incomingPayment.id,
                    incomingGrant.access_token.value
                );
                console.log(`[Incoming] check ${i + 1}:`, latest?.receivedAmount);
                const received = Number(latest?.receivedAmount?.value || "0");
                if (received > 0) break;
            }

            // 5) Completar el incoming para que deje de estar PENDING en la UI
            await this.openPaymentsService.completeIncomingPayment(
                recipient.recipientWallet.resourceServer,
                incomingPayment.id,
                incomingGrant.access_token.value
            );

            // (Opcional) verificar flag completed:true
            for (let i = 0; i < 10; i++) {
                const ver = await this.openPaymentsService.getIncomingPayment(
                    recipient.recipientWallet.resourceServer,
                    incomingPayment.id,
                    incomingGrant.access_token.value
                );
                console.log(`[Incoming] verify ${i + 1}: completed=${ver?.completed}`, "received=", ver?.receivedAmount);
                if (ver?.completed) break;
                await _sleep(800 + i * 300);
            }
            return {
                recipient: {
                    walletUrl: recipient.walletUrl,
                    description: recipient.description,
                    priority: recipient.priority
                },
                status: "completed",
                paymentDetails: {
                    sentAmount: outgoingPayment.sentAmount,
                    debitAmount: outgoingPayment.debitAmount,
                    receiveAmount: outgoingPayment.receiveAmount,
                    receiver: outgoingPayment.receiver
                },
                transactionInfo: {
                    incomingPaymentId: incomingPayment.id,
                    outgoingPaymentId: outgoingPayment.id,
                    quoteId: quote.id
                },
                completedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error(`❌ [${splitPayment.splitId}] Error pagando a ${recipient.walletUrl}:`, error?.message || error);
            throw error;
        }
    }

    async _createIncomingPayment(recipientWallet, amount, description) {
        if (!recipientWallet?.id) throw new Error("recipientWallet inválido: falta id");

        // 1) Grant del AS del receptor con permisos para crear, leer y completar
        const incomingGrant = await this.openPaymentsService.createIncomingPaymentGrant(
            recipientWallet,
            ["create", "read", "complete"]
        );

        // 2) Payload para el RS del receptor (el incoming se crea en la wallet del receptor)
        const payload = {
            walletAddress: recipientWallet.id,
            incomingAmount: {
                assetCode: recipientWallet.assetCode,
                assetScale: recipientWallet.assetScale,
                value: amount
            }
        };

        const incomingPayment = await this.openPaymentsService.createIncomingPayment(
            recipientWallet,          // se inicializa el client con la wallet del receptor
            incomingGrant,            // token del AS del receptor
            payload
        );

        // Devolvemos BOTH: incoming + grant (para poder leerlo y completarlo después)
        return { incomingPayment, incomingGrant };
    }

    async _createQuote(senderWallet, recipientWallet, incomingPaymentId,debitAmountValue) {
        const quoteGrant = await this.openPaymentsService.createQuoteGrant(senderWallet);
        console.log(quoteGrant)


        try {
            return await this.openPaymentsService.createQuote(
                recipientWallet.resourceServer,
                quoteGrant,
                {
                    walletAddress: senderWallet.id,
                    receiver: incomingPaymentId,
                    method: "ilp",
                    debitAmount: {
                        assetCode: senderWallet.assetCode,
                        assetScale: senderWallet.assetScale,
                        value: debitAmountValue.toString()
                    }
                }
            );
        }catch (e){
            console.log(e)
        }
    }

    _validateSplitRequest(request) {
        if (!request.senderWalletUrl) {
            throw new Error('Sender wallet URL is required');
        }

        if (!request.recipients || !Array.isArray(request.recipients) || request.recipients.length === 0) {
            throw new Error('At least one recipient is required');
        }

        // Validar cada receptor
        request.recipients.forEach((recipient, index) => {
            if (!recipient.walletUrl) {
                throw new Error(`Recipient ${index}: wallet URL is required`);
            }

            if (!['fixed', 'percentage', 'remaining'].includes(recipient.type)) {
                throw new Error(`Recipient ${index}: type must be 'fixed', 'percentage', or 'remaining'`);
            }

            if (recipient.type !== 'remaining' && (!recipient.value || Number(recipient.value) <= 0)) {
                throw new Error(`Recipient ${index}: valid value is required`);
            }

            if (recipient.priority && (recipient.priority < 1 || recipient.priority > 10)) {
                throw new Error(`Recipient ${index}: priority must be between 1 and 10`);
            }
        });

        // Validar que solo hay un receptor 'remaining'
        const remainingRecipients = request.recipients.filter(r => r.type === 'remaining');
        if (remainingRecipients.length > 1) {
            throw new Error('Only one recipient can have type "remaining"');
        }

        // Validar porcentajes
        const totalPercentage = request.recipients
            .filter(r => r.type === 'percentage')
            .reduce((sum, r) => sum + Number(r.value), 0);

        if (totalPercentage > 100) {
            throw new Error(`Total percentage (${totalPercentage}%) exceeds 100%`);
        }

        // Si hay porcentajes o 'remaining', se requiere totalAmount
        const hasPercentage = request.recipients.some(r => r.type === 'percentage');
        const hasRemaining = request.recipients.some(r => r.type === 'remaining');

        if ((hasPercentage || hasRemaining) && !request.totalAmount) {
            throw new Error('Total amount is required when using percentage or remaining recipients');
        }
    }

    _calculateTotalAmount(recipients) {
        return recipients.reduce((sum, recipient) => sum + recipient.calculatedAmount, 0);
    }

    _sortRecipientsByPriority(recipients) {
        return [...recipients].sort((a, b) => (a.priority || 5) - (b.priority || 5));
    }

    _getRecipientStatus(splitPayment, walletUrl) {
        if (!splitPayment.executionResults) return 'pending';

        const result = splitPayment.executionResults.find(r => r.recipient.walletUrl === walletUrl);
        return result ? result.status : 'pending';
    }

    _buildFinishUri(splitId) {
        return this.openPaymentsService.config.baseUrl ?
            `${this.openPaymentsService.config.baseUrl}/split-payment/callback/${splitId}` :
            `http://localhost:3000/split-payment/callback/${splitId}`;
    }

    _updateSplitPaymentState(splitId, updates) {
        const split = this.splitPayments.get(splitId);
        if (split) {
            Object.assign(split, updates);
        }
    }

    _generateSplitId() {
        return `split_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

/**
 * Factory function para crear el servicio
 */
export function createSplitPaymentService(config) {
    return new SplitPaymentService(config);
}

export default SplitPaymentService;