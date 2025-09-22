import ClientOpenPaymentsService, {createOpenPaymentsService, DEFAULT_TEST_CONFIG} from "../ClientOpenPaymentsService";

/*
class OpenPaymentsUseCaseService{
    openPaymentsService;

    constructor() {
        this.openPaymentsService=createOpenPaymentsService(DEFAULT_TEST_CONFIG);
    }
    async preparePayment(senderWalletUrl, receiverWalletUrl, amount) {
        try {
            console.log("🚀 Iniciando preparación del pago...");

            // 1. Obtener wallet addresses
            console.log("📋 Obteniendo información de wallets...");
            const [senderWallet, receiverWallet] = await Promise.all([
                this.openPaymentsService.getWalletAddress(senderWalletUrl),
                this.openPaymentsService.getWalletAddress(receiverWalletUrl)
            ]);

            // 2. Crear incoming payment grant
            console.log("🔐 Creando grant para incoming payment...");
            const incomingGrant = await this.openPaymentsService.createIncomingPaymentGrant(receiverWallet);

            // 3. Crear incoming payment
            console.log("📥 Creando incoming payment...");
            const incomingPayment = await this.openPaymentsService.createIncomingPayment(
                receiverWallet,
                incomingGrant,
                amount
            );

            // 4. Crear quote grant
            console.log("🔐 Creando grant para quote...");
            const quoteGrant = await this.openPaymentsService.createQuoteGrant(senderWallet);

            // 5. Crear quote
            console.log("💰 Creando quote...");
            const quote = await this.openPaymentsService.createQuote(
                senderWallet,
                receiverWallet,
                quoteGrant,
                incomingPayment.id
            );

            // 6. Crear outgoing payment grant (con interacción)
            console.log("🔐 Creando grant para outgoing payment...");
            const outgoingGrant = await this.openPaymentsService.createOutgoingPaymentGrant(
                senderWallet,
                quote.debitAmount,
                true
            );

            console.log("✅ Pago preparado exitosamente!");

            return {
                senderWallet,
                receiverWallet,
                incomingPayment,
                quote,
                outgoingGrant,
                // URL de autorización si existe
                authorizationUrl: outgoingGrant.interact?.redirect,
                // Información para continuar el pago
                continueInfo: {
                    continueUri: outgoingGrant.continue.uri,
                    continueToken: outgoingGrant.continue.access_token.value
                }
            };

        } catch (error) {
            console.error("❌ Error preparando el pago:", error.message);
            throw error;
        }
    }

 }
    async completePayment(preparedPayment) {
        try {
            console.log("🔄 Finalizando el pago...");

            // 1. Finalizar el grant del outgoing payment
            console.log("🔐 Finalizando grant de outgoing payment...");
            const finalizedGrant = await this.openPaymentsService.continueGrant(
                preparedPayment.continueInfo.continueUri,
                preparedPayment.continueInfo.continueToken
            );

            // 2. Crear outgoing payment
            console.log("📤 Creando outgoing payment...");
            const outgoingPayment = await this.openPaymentsService.createOutgoingPayment(
                preparedPayment.senderWallet,
                finalizedGrant,
                preparedPayment.quote.id
            );

            console.log("✅ Pago completado exitosamente!");

            return {
                outgoingPayment,
                incomingPayment: preparedPayment.incomingPayment,
                quote: preparedPayment.quote,
                status: 'completed'
            };

        } catch (error) {
            console.error("❌ Error completando el pago:", error.message);
            throw error;
        }
    }


    async processPayment(senderWalletUrl, receiverWalletUrl, amount, onAuthorizationNeeded) {
        // Preparar el pago
        const preparedPayment = await this.openPaymentsService.preparePayment(senderWalletUrl, receiverWalletUrl, amount);

        // Si hay URL de autorización, llamar al callback
        if (preparedPayment.authorizationUrl && onAuthorizationNeeded) {
            console.log("🔐 Autorización requerida...");
            await onAuthorizationNeeded(preparedPayment.authorizationUrl);
        }

        // Completar el pago
        return await this.openPaymentsService.completePayment(preparedPayment);
    }


    async sendPayment(senderWalletUrl, receiverWalletUrl, amount) {
        return await this.openPaymentsService.processPayment(
            senderWalletUrl,
            receiverWalletUrl,
            amount,
            null
        );
    }
}
*/