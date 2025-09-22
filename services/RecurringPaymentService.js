import {createOpenPaymentsService, DEFAULT_TEST_CONFIG} from "./ClientOpenPaymentsService.js";

/**
 * Servicio especializado para manejar pagos recurrentes
 * Permite crear grants de larga duración y ejecutar pagos automáticos en intervalos
 */
class RecurringPaymentService {
    constructor(config = DEFAULT_TEST_CONFIG) {
        this.openPaymentsService = createOpenPaymentsService(config);
        this.recurringPayments = new Map(); // Configuraciones de pagos recurrentes
        this.activeMonitors = new Map(); // Monitores activos para ejecución automática
    }

    /**
     * Crea un pago recurrente con grant de larga duración
     * @param {Object} recurringRequest - Configuración del pago recurrente
     * @param {string} recurringRequest.senderWalletUrl - URL del wallet pagador
     * @param {string} recurringRequest.receiverWalletUrl - URL del wallet receptor
     * @param {string} recurringRequest.amount - Monto por pago individual
     * @param {Object} recurringRequest.incomingAmount - Monto por pago individual
     * @param {Object} recurringRequest.schedule - Configuración de programación
     * @param {string} recurringRequest.schedule.interval - Intervalo entre pagos (ISO 8601 duration)
     * @param {Date|string} [recurringRequest.schedule.startDate] - Fecha de inicio
     * @param {Date|string} [recurringRequest.schedule.endDate] - Fecha de fin
     * @param {number} [recurringRequest.schedule.maxPayments] - Número máximo de pagos
     * @param {string} recurringRequest.totalBudget - Presupuesto total máximo
     * @param {string} recurringRequest.expiresAt - Presupuesto total máximo
     * @param {string} [recurringRequest.description] - Descripción del pago recurrente
     * @returns {Promise<Object>} Información del pago recurrente creado
     */
    async createRecurringPayment(recurringRequest) {
        const recurringId = this._generateRecurringId();

        try {
            console.log(`🔄 [${recurringId}] Creando pago recurrente...`);

            // 1. Validar configuración
            this._validateRecurringRequest(recurringRequest);

            // 2. Obtener información de wallets
            const [senderWallet, receiverWallet] = await this.openPaymentsService.getMultipleWalletAddresses([
                recurringRequest.senderWalletUrl,
                recurringRequest.receiverWalletUrl
            ]);

            //2 Solicitar una concesión de autorizacion para un pago entrante
            const incomingPaymentGrant= await  this.openPaymentsService.createIncomingPaymentGrant(receiverWallet,["list", "read", "read-all", "complete", "create"],);
            // crear pago entrante
            const incomingPayment= await this.openPaymentsService.createIncomingPayment(receiverWallet,incomingPaymentGrant,{walletAddress: recurringRequest.receiverWalletUrl,incomingAmount: recurringRequest.incomingAmount});
            console.log(incomingPayment)
            // crear grant para cotización
            const quoteGrant= await this.openPaymentsService.createQuoteGrant(senderWallet,["create", "read", "read-all"]);
            console.log(quoteGrant)

            const quote= await this.openPaymentsService.createQuote(senderWallet.resourceServer,quoteGrant,{method:"ilp",walletAddress: senderWallet.id,receiver: incomingPayment.id})

            console.log(quote)

            // 3. Preparar límites del grant de larga duración
            const grantLimits = this._buildRecurringQuoteGrantLimits( quote);
            const finishUri = this._buildFinishUri(recurringId);

            // 4. Crear grant interactivo de larga duración
            const authFlow = await this.openPaymentsService.initiateAuthorizationFlow(
                senderWallet,
                grantLimits,
                finishUri
            );

            // 5. Guardar configuración del pago recurrente
            const recurringPayment = {
                recurringId,
                status: 'authorization_pending',
                senderWallet,
                receiverWallet,
                recurringRequest,
                authFlow,
                totalBudget: Number(recurringRequest.totalBudget),
                amountPerPayment: Number(recurringRequest.amount),
                totalSpent: 0,
                paymentCount: 0,
                createdAt: new Date().toISOString(),
                paymentHistory: [],
                nextPaymentDate: recurringRequest.schedule.startDate ?
                    new Date(recurringRequest.schedule.startDate).toISOString() :
                    new Date().toISOString()
            };

            this.recurringPayments.set(recurringId, recurringPayment);

            console.log(`✅ [${recurringId}] Pago recurrente creado - Autorización requerida`);

            return {
                recurringId,
                status: 'authorization_pending',
                authorizationUrl: authFlow.redirectUrl,
                recurringInfo: {
                    senderWallet: senderWallet.id,
                    receiverWallet: receiverWallet.id,
                    amountPerPayment: recurringRequest.amount,
                    totalBudget: recurringRequest.totalBudget,
                    interval: recurringRequest.schedule.interval,
                    maxPayments: recurringRequest.schedule.maxPayments,
                    startDate: recurringPayment.nextPaymentDate,
                    endDate: recurringRequest.schedule.endDate,
                    description: recurringRequest.description
                },
                continueInfo: {
                    continueUri: authFlow.continueUri,
                    continueToken: authFlow.continueToken,
                    nonce: authFlow.nonce
                }
            };

        } catch (error) {
            console.error(`❌ [${recurringId}] Error creando pago recurrente:`, error.message);

            // Guardar sesión con error
            this.recurringPayments.set(recurringId, {
                recurringId,
                status: 'failed',
                error: error.message,
                recurringRequest,
                createdAt: new Date().toISOString()
            });

            throw new Error(`Recurring payment creation failed: ${error.message}`);
        }
    }

    /**
     * Finaliza la configuración del pago recurrente después de la autorización
     * @param {string} recurringId - ID del pago recurrente
     * @param {string} interactRef - Referencia de interacción del callback
     * @param {string} [callbackHash] - Hash del callback para verificación
     * @returns {Promise<Object>} Pago recurrente activado
     */
    async activateRecurringPayment(recurringId, interactRef, callbackHash = null) {
        try {
            console.log(`🔄 [${recurringId}] Activando pago recurrente...`);

            // 1. Recuperar configuración
            const recurringPayment = this.recurringPayments.get(recurringId);
            if (!recurringPayment) {
                throw new Error('Recurring payment not found');
            }

            if (recurringPayment.status !== 'authorization_pending') {
                throw new Error(`Invalid recurring payment status: ${recurringPayment.status}`);
            }

            // 2. Verificar hash si se proporciona
            if (callbackHash && recurringPayment.authFlow.nonce) {
                const isValidHash = this.openPaymentsService.verifyCallbackHash(
                    callbackHash,
                    recurringPayment.authFlow.nonce,
                    interactRef
                );
                if (!isValidHash) {
                    throw new Error('Invalid callback hash');
                }
            }

            // 3. Finalizar grant
            const finalizedGrant = await this.openPaymentsService.completeAuthorizationFlow(
                recurringPayment.authFlow.continueUri,
                recurringPayment.authFlow.continueToken,
                interactRef
            );

            // 4. Activar pago recurrente
            const activeRecurring = {
                ...recurringPayment,
                status: 'active',
                finalizedGrant,
                activatedAt: new Date().toISOString()
            };

            this.recurringPayments.set(recurringId, activeRecurring);

            console.log(`✅ [${recurringId}] Pago recurrente activado exitosamente`);

            return {
                recurringId,
                status: 'active',
                recurringInfo: {
                    senderWallet: activeRecurring.senderWallet.id,
                    receiverWallet: activeRecurring.receiverWallet.id,
                    amountPerPayment: activeRecurring.amountPerPayment,
                    totalBudget: activeRecurring.totalBudget,
                    remainingBudget: activeRecurring.totalBudget - activeRecurring.totalSpent,
                    interval: activeRecurring.recurringRequest.schedule.interval,
                    nextPaymentDate: activeRecurring.nextPaymentDate,
                    activatedAt: activeRecurring.activatedAt
                }
            };

        } catch (error) {
            console.error(`❌ [${recurringId}] Error activando pago recurrente:`, error.message);

            // Marcar como fallido
            const recurring = this.recurringPayments.get(recurringId);
            if (recurring) {
                this.recurringPayments.set(recurringId, {
                    ...recurring,
                    status: 'failed',
                    error: error.message,
                    failedAt: new Date().toISOString()
                });
            }

            throw new Error(`Recurring payment activation failed: ${error.message}`);
        }
    }

    /**
     * Ejecuta un pago individual del ciclo recurrente
     * @param {string} recurringId - ID del pago recurrente
     * @param {boolean} [force=false] - Forzar ejecución ignorando fecha programada
     * @returns {Promise<Object>} Resultado del pago ejecutado
     */
    async executeRecurringPayment(recurringId, force = false) {
        try {
            console.log(`💰 [${recurringId}] Ejecutando pago recurrente...`);

            // 1) Validaciones
            const recurringPayment = this.recurringPayments.get(recurringId);
            if (!recurringPayment) throw new Error('Recurring payment not found');
            if (recurringPayment.status !== 'active') {
                throw new Error(`Recurring payment not active. Status: ${recurringPayment.status}`);
            }
            if (!force && !this._shouldExecuteNow(recurringPayment)) {
                throw new Error('Payment not due for execution yet');
            }
            if (!this._canExecutePayment(recurringPayment)) {
                throw new Error('Recurring payment limits exceeded');
            }

            // 2) Crear INCOMING en el RECEIVER (⚠️ antes lo hacías con el sender)
            const incomingPayment = await this._createIncomingPayment(
                recurringPayment.receiverWallet, // <- receptor
                recurringPayment.amountPerPayment.toString(),
                `Recurring payment ${recurringPayment.paymentCount + 1} - ${recurringPayment.recurringRequest.description || 'Recurring payment'}`
            );
            console.log(incomingPayment)


            // 3) Crear QUOTE en el RS del RECEIVER, firmando como SENDER
            const quote = await this._createQuote(
                recurringPayment.senderWallet,   // quien paga
                recurringPayment.receiverWallet, // RS donde se crea el quote
                incomingPayment.id               // destino (incoming del receptor)
            );

            // 4) OUTGOING en el RS del SENDER, usando el grant long-lived ya finalizado
            const outgoingPayment = await this.openPaymentsService.createOutgoingPayment(
                recurringPayment.senderWallet,       // RS del sender
                recurringPayment.finalizedGrant,     // grant finalizado del recurrente (sender)
                {
                    walletAddress: recurringPayment.senderWallet.id,
                    quoteId: quote.id
                }
            );

            // 5) Actualizar estado
            const debitAmount = Number(quote.debitAmount.value);
            const nextPaymentDate = this._calculateNextPaymentDate(recurringPayment);

            this._updateRecurringPaymentState(recurringId, {
                totalSpent: recurringPayment.totalSpent + debitAmount,
                paymentCount: recurringPayment.paymentCount + 1,
                lastPaymentAt: new Date().toISOString(),
                nextPaymentDate: nextPaymentDate?.toISOString() || null
            });

            // 6) Resultado
            const paymentResult = {
                recurringId,
                paymentNumber: recurringPayment.paymentCount + 1,
                paymentId: outgoingPayment.id,
                executedAt: new Date().toISOString(),
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
                recurringStatus: {
                    totalSpent: recurringPayment.totalSpent + debitAmount,
                    remainingBudget: recurringPayment.totalBudget - (recurringPayment.totalSpent + debitAmount),
                    paymentCount: recurringPayment.paymentCount + 1,
                    nextPaymentDate: nextPaymentDate?.toISOString() || null,
                    isComplete: !this._canExecutePayment(recurringPayment)
                }
            };

            this._addPaymentToHistory(recurringId, paymentResult);

            if (!this._canExecutePayment(recurringPayment)) {
                this._updateRecurringPaymentState(recurringId, { status: 'completed' });
                console.log(`🏁 [${recurringId}] Pago recurrente completado - Se alcanzaron los límites`);
            }

            console.log(`✅ [${recurringId}] Pago ${paymentResult.paymentNumber} ejecutado exitosamente`);
            return paymentResult;

        } catch (error) {
            console.error(`❌ [${recurringId}] Error ejecutando pago recurrente:`, error.message);
            throw new Error(`Recurring payment execution failed: ${error.message}`);
        }
    }

    /**
     * Inicia monitor automático para un pago recurrente
     * @param {string} recurringId - ID del pago recurrente
     * @param {number} [checkIntervalMs=300000] - Intervalo de verificación en ms (5 minutos por defecto)
     * @returns {Function} Función para detener el monitor
     */
    startAutomaticExecution(recurringId, checkIntervalMs = 300000) {
        try {
            const recurringPayment = this.recurringPayments.get(recurringId);
            if (!recurringPayment) {
                throw new Error('Recurring payment not found');
            }

            if (recurringPayment.status !== 'active') {
                throw new Error('Cannot start monitor for inactive recurring payment');
            }

            console.log(`⏰ [${recurringId}] Iniciando ejecución automática (cada ${checkIntervalMs}ms)...`);

            const intervalId = setInterval(async () => {
                try {
                    const current = this.recurringPayments.get(recurringId);
                    if (!current || current.status !== 'active') {
                        console.log(`🛑 [${recurringId}] Deteniendo monitor - Estado: ${current?.status || 'not found'}`);
                        clearInterval(intervalId);
                        this.activeMonitors.delete(recurringId);
                        return;
                    }

                    if (this._shouldExecuteNow(current) && this._canExecutePayment(current)) {
                        console.log(`⚡ [${recurringId}] Ejecutando pago automático...`);
                        await this.executeRecurringPayment(recurringId);
                    }

                } catch (error) {
                    console.error(`❌ [${recurringId}] Error en ejecución automática:`, error.message);

                    // Si hay muchos errores consecutivos, detener el monitor
                    const current = this.recurringPayments.get(recurringId);
                    if (current) {
                        current.consecutiveErrors = (current.consecutiveErrors || 0) + 1;
                        if (current.consecutiveErrors >= 3) {
                            console.log(`🛑 [${recurringId}] Deteniendo monitor por errores consecutivos`);
                            clearInterval(intervalId);
                            this.activeMonitors.delete(recurringId);
                            this._updateRecurringPaymentState(recurringId, {
                                status: 'error',
                                error: 'Too many consecutive execution errors'
                            });
                        }
                    }
                }
            }, checkIntervalMs);

            // Guardar referencia del monitor
            this.activeMonitors.set(recurringId, {
                intervalId,
                startedAt: new Date().toISOString(),
                checkIntervalMs
            });

            // Función para detener el monitor
            const stopMonitor = () => {
                console.log(`🛑 [${recurringId}] Deteniendo monitor automático...`);
                clearInterval(intervalId);
                this.activeMonitors.delete(recurringId);
            };

            return stopMonitor;

        } catch (error) {
            console.error(`❌ [${recurringId}] Error iniciando monitor:`, error.message);
            throw error;
        }
    }

    /**
     * Pausa un pago recurrente
     * @param {string} recurringId - ID del pago recurrente
     * @returns {Promise<void>}
     */
    async pauseRecurringPayment(recurringId) {
        try {
            console.log(`⏸️ [${recurringId}] Pausando pago recurrente...`);

            const recurringPayment = this.recurringPayments.get(recurringId);
            if (!recurringPayment) {
                throw new Error('Recurring payment not found');
            }

            // Detener monitor si existe
            const monitor = this.activeMonitors.get(recurringId);
            if (monitor) {
                clearInterval(monitor.intervalId);
                this.activeMonitors.delete(recurringId);
            }

            // Cambiar estado
            this._updateRecurringPaymentState(recurringId, {
                status: 'paused',
                pausedAt: new Date().toISOString()
            });

            console.log(`✅ [${recurringId}] Pago recurrente pausado`);

        } catch (error) {
            console.error(`❌ [${recurringId}] Error pausando pago:`, error.message);
            throw error;
        }
    }

    /**
     * Reanuda un pago recurrente pausado
     * @param {string} recurringId - ID del pago recurrente
     * @returns {Promise<void>}
     */
    async resumeRecurringPayment(recurringId) {
        try {
            console.log(`▶️ [${recurringId}] Reanudando pago recurrente...`);

            const recurringPayment = this.recurringPayments.get(recurringId);
            if (!recurringPayment) {
                throw new Error('Recurring payment not found');
            }

            if (recurringPayment.status !== 'paused') {
                throw new Error(`Cannot resume payment with status: ${recurringPayment.status}`);
            }

            // Cambiar estado
            this._updateRecurringPaymentState(recurringId, {
                status: 'active',
                resumedAt: new Date().toISOString()
            });

            console.log(`✅ [${recurringId}] Pago recurrente reanudado`);

        } catch (error) {
            console.error(`❌ [${recurringId}] Error reanudando pago:`, error.message);
            throw error;
        }
    }

    /**
     * Cancela un pago recurrente definitivamente
     * @param {string} recurringId - ID del pago recurrente
     * @returns {Promise<void>}
     */
    async cancelRecurringPayment(recurringId) {
        try {
            console.log(`🛑 [${recurringId}] Cancelando pago recurrente...`);

            const recurringPayment = this.recurringPayments.get(recurringId);
            if (!recurringPayment) {
                throw new Error('Recurring payment not found');
            }

            // Detener monitor si existe
            const monitor = this.activeMonitors.get(recurringId);
            if (monitor) {
                clearInterval(monitor.intervalId);
                this.activeMonitors.delete(recurringId);
            }

            // Revocar grant si es posible
            if (recurringPayment.finalizedGrant?.access_token?.manage) {
                await this.openPaymentsService.revokeGrant(
                    recurringPayment.finalizedGrant.access_token.manage,
                    recurringPayment.finalizedGrant.access_token.value
                );
            }

            // Marcar como cancelado
            this._updateRecurringPaymentState(recurringId, {
                status: 'cancelled',
                cancelledAt: new Date().toISOString()
            });

            console.log(`✅ [${recurringId}] Pago recurrente cancelado`);

        } catch (error) {
            console.error(`❌ [${recurringId}] Error cancelando pago:`, error.message);
            throw error;
        }
    }

    /**
     * Obtiene el estado completo de un pago recurrente
     */
    getRecurringPaymentStatus(recurringId) {
        const recurring = this.recurringPayments.get(recurringId);
        if (!recurring) return null;

        const monitor = this.activeMonitors.get(recurringId);

        return {
            recurringId: recurring.recurringId,
            status: recurring.status,
            senderWallet: recurring.senderWallet?.id,
            receiverWallet: recurring.receiverWallet?.id,
            amountPerPayment: recurring.amountPerPayment,
            totalBudget: recurring.totalBudget,
            totalSpent: recurring.totalSpent,
            remainingBudget: recurring.totalBudget - recurring.totalSpent,
            paymentCount: recurring.paymentCount,
            maxPayments: recurring.recurringRequest?.schedule?.maxPayments,
            interval: recurring.recurringRequest?.schedule?.interval,
            nextPaymentDate: recurring.nextPaymentDate,
            lastPaymentAt: recurring.lastPaymentAt,
            createdAt: recurring.createdAt,
            activatedAt: recurring.activatedAt,
            description: recurring.recurringRequest?.description,
            isMonitorActive: !!monitor,
            monitorStartedAt: monitor?.startedAt,
            estimatedEndDate: this._estimateEndDate(recurring)
        };
    }

    /**
     * Lista todos los pagos recurrentes
     */
    listRecurringPayments(status = null) {
        const payments = [];

        for (const [recurringId] of this.recurringPayments) {
            const paymentStatus = this.getRecurringPaymentStatus(recurringId);
            if (paymentStatus && (!status || paymentStatus.status === status)) {
                payments.push(paymentStatus);
            }
        }

        return payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    /**
     * Obtiene el historial de pagos de un pago recurrente
     */
    getPaymentHistory(recurringId, limit = 50) {
        const recurring = this.recurringPayments.get(recurringId);
        if (!recurring) return null;

        const history = recurring.paymentHistory || [];
        return history
            .slice(-limit)
            .sort((a, b) => new Date(b.executedAt) - new Date(a.executedAt));
    }

    // ============= MÉTODOS PRIVADOS =============

    async _createIncomingPayment(receiverWallet, amount, description) {
        const incomingGrant = await this.openPaymentsService.createIncomingPaymentGrant(receiverWallet);

        console.log(incomingGrant)
        const paymentData = {
            walletAddress: receiverWallet.id,
            incomingAmount: {
                assetCode: receiverWallet.assetCode,
                assetScale: receiverWallet.assetScale,
                value: amount
            }
        };
        console.log(paymentData)

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
            receiverWallet.resourceServer,      // <- RS DEL RECEPTOR (antes: senderWallet.resourceServer)
            quoteGrant,
            {
                walletAddress: senderWallet.id,   // quién paga
                receiver: incomingPaymentId,      // incoming del receptor
                method: "ilp"
            }
        );
    }

    _buildRecurringGrantLimits(senderWallet, recurringRequest) {
        const limits = {
            debitAmount: {
                assetCode: senderWallet.assetCode,
                assetScale: senderWallet.assetScale,
                value: recurringRequest.totalBudget
            }
        };

        // Agregar intervalo si se especifica
        if (recurringRequest.schedule.interval) {
            limits.interval = recurringRequest.schedule.interval;
        }

        return limits;
    }

    _buildRecurringQuoteGrantLimits(quote) {
       console.log(quote)
        return {
            debitAmount: {
                assetCode: quote.debitAmount.assetCode,
                assetScale: quote.debitAmount.assetScale,
                value: quote.debitAmount.value,
            },
        };
    }

    _buildIncomingPaymentsGrant(){
        return (
            {
            access_token: {
                access: [
                    {
                        type: "incoming-payment",
                        actions: ["list", "read", "read-all", "complete", "create"],
                    },
                ],
            },
        })
    }
    _buildFinishUri(recurringId) {
        return this.openPaymentsService.config.baseUrl ?
            `${this.openPaymentsService.config.baseUrl}/recurring-payment/callback/${recurringId}` :
            `http://localhost:3000/recurring-payment/callback/${recurringId}`;
    }

    _validateRecurringRequest(request) {
        if (!request.senderWalletUrl || !request.receiverWalletUrl) {
            throw new Error('Sender and receiver wallet URLs are required');
        }

        if (!request.amount || Number(request.amount) <= 0) {
            throw new Error('Valid payment amount is required');
        }

        if (!request.totalBudget || Number(request.totalBudget) <= 0) {
            throw new Error('Valid total budget is required');
        }

        if (Number(request.amount) > Number(request.totalBudget)) {
            throw new Error('Payment amount cannot exceed total budget');
        }

        if (!request.schedule?.interval) {
            throw new Error('Payment interval is required');
        }

        // Validar formato ISO 8601 duration básico
        if (!this._isValidInterval(request.schedule.interval)) {
            throw new Error('Invalid interval format. Use ISO 8601 duration (e.g., P1D, PT1H, P1W)');
        }

        if (request.schedule.startDate && new Date(request.schedule.startDate) < new Date()) {
            throw new Error('Start date cannot be in the past');
        }

        if (request.schedule.endDate && request.schedule.startDate &&
            new Date(request.schedule.endDate) <= new Date(request.schedule.startDate)) {
            throw new Error('End date must be after start date');
        }
    }

    _isValidInterval(interval) {
        // Validación básica para formato ISO 8601 duration
        return /^P(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+S)?)?$/.test(interval);
    }

    _shouldExecuteNow(recurringPayment) {
        if (!recurringPayment.nextPaymentDate) return false;
        return new Date(recurringPayment.nextPaymentDate) <= new Date();
    }

    _canExecutePayment(recurringPayment) {
        // Verificar presupuesto
        const remainingBudget = recurringPayment.totalBudget - recurringPayment.totalSpent;
        if (remainingBudget < recurringPayment.amountPerPayment) {
            return false;
        }

        // Verificar límite de pagos
        const maxPayments = recurringPayment.recurringRequest?.schedule?.maxPayments;
        if (maxPayments && recurringPayment.paymentCount >= maxPayments) {
            return false;
        }

        // Verificar fecha de fin
        const endDate = recurringPayment.recurringRequest?.schedule?.endDate;
        if (endDate && new Date() > new Date(endDate)) {
            return false;
        }

        return recurringPayment.status === 'active';
    }

    _calculateNextPaymentDate(recurringPayment) {
        const interval = recurringPayment.recurringRequest.schedule.interval;
        const lastPayment = recurringPayment.lastPaymentAt ?
            new Date(recurringPayment.lastPaymentAt) :
            new Date();

        // Parsing básico de ISO 8601 duration
        const nextDate = new Date(lastPayment);

        if (interval.includes('P') && interval.includes('D')) {
            const days = parseInt(interval.match(/(\d+)D/)?.[1] || '0');
            nextDate.setDate(nextDate.getDate() + days);
        } else if (interval.includes('P') && interval.includes('W')) {
            const weeks = parseInt(interval.match(/(\d+)W/)?.[1] || '0');
            nextDate.setDate(nextDate.getDate() + (weeks * 7));
        } else if (interval.includes('T') && interval.includes('H')) {
            const hours = parseInt(interval.match(/(\d+)H/)?.[1] || '0');
            nextDate.setHours(nextDate.getHours() + hours);
        } else if (interval.includes('P') && interval.includes('M') && !interval.includes('T')) {
            const months = parseInt(interval.match(/P(?:\d+Y)?(\d+)M/)?.[1] || '0');
            nextDate.setMonth(nextDate.getMonth() + months);
        }

        return nextDate;
    }

    _estimateEndDate(recurringPayment) {
        const maxPayments = recurringPayment.recurringRequest?.schedule?.maxPayments;
        const explicitEndDate = recurringPayment.recurringRequest?.schedule?.endDate;

        if (explicitEndDate) {
            return explicitEndDate;
        }

        if (maxPayments) {
            const remainingPayments = maxPayments - recurringPayment.paymentCount;
            if (remainingPayments <= 0) return null;

            let estimatedDate = new Date(recurringPayment.nextPaymentDate || new Date());

            // Estimar basado en el intervalo
            for (let i = 0; i < remainingPayments - 1; i++) {
                estimatedDate = this._calculateNextPaymentDate({
                    ...recurringPayment,
                    lastPaymentAt: estimatedDate.toISOString()
                });
            }

            return estimatedDate.toISOString();
        }

        return null; // Sin límite de tiempo definido
    }

    _updateRecurringPaymentState(recurringId, updates) {
        const recurring = this.recurringPayments.get(recurringId);
        if (recurring) {
            Object.assign(recurring, updates);
        }
    }

    _addPaymentToHistory(recurringId, paymentResult) {
        const recurring = this.recurringPayments.get(recurringId);
        if (recurring) {
            recurring.paymentHistory = recurring.paymentHistory || [];
            recurring.paymentHistory.push({
                paymentNumber: paymentResult.paymentNumber,
                paymentId: paymentResult.paymentId,
                executedAt: paymentResult.executedAt,
                amount: Number(paymentResult.paymentDetails.debitAmount.value),
                receiver: paymentResult.paymentDetails.receiver,
                transactionInfo: paymentResult.transactionInfo
            });
        }
    }

    _generateRecurringId() {
        return `recurring_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

/**
 * Factory function para crear el servicio
 */
export function createRecurringPaymentService(config) {
    return new RecurringPaymentService(config);
}

export default RecurringPaymentService;