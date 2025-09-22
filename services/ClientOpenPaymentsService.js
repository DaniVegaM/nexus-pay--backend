import * as fs from "fs";
import { createAuthenticatedClient, isFinalizedGrant, isPendingGrant } from "@interledger/open-payments";
import * as readline from "node:readline";
import crypto from "crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";

/**
 * Servicio cliente para interactuar directamente con la API de Open Payments
 * Proporciona todas las funcionalidades básicas y manejo de flujo de autorización
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
class ClientOpenPaymentsService {
    /**
     * Constructor del servicio
     * @param {Object} config - Configuración del cliente
     * @param {string} config.walletAddressUrl - URL de la dirección de billetera
     * @param {string} config.keyId - ID de la clave para autenticación
     * @param {string|Buffer} config.privateKey - Clave privada (contenido o ruta al archivo)
     * @param {string} [config.baseUrl] - URL base para callbacks (requerido para flujos interactivos web)
     */
    constructor(config) {
        this.config = config;
        this.client = null;
    }

    /**
     * Inicializa y retorna un cliente autenticado de Open Payments
     */
    async initializeClient() {
        if (this.client) return this.client;

        const privateKey = typeof this.config.privateKey === 'string'
            ? this.config.privateKey
            : fs.readFileSync(this.config.privateKey, "utf8");

        this.client = await createAuthenticatedClient({
            walletAddressUrl: this.config.walletAddressUrl,
            privateKey: privateKey,
            keyId: this.config.keyId,
        });

        return this.client;
    }

    async initializeClientFor(walletAddressUrl) {
        // Reutiliza si ya es el mismo wallet activo
        if (this.client && this._currentWallet === walletAddressUrl) {
            return this.client;
        }

        const privateKey =
            typeof this.config.privateKey === 'string'
                ? this.config.privateKey
                : fs.readFileSync(this.config.privateKey, "utf8");

        const dynamicClient = await createAuthenticatedClient({
            walletAddressUrl,
            privateKey,
            keyId: this.config.keyId,
        });

        // Guarda como “cliente actual” (opcional)
        this.client = dynamicClient;
        this._currentWallet = walletAddressUrl;

        return dynamicClient;
    }
    // ============= WALLET ADDRESS OPERATIONS =============

    /**
     * Obtiene información de una dirección de billetera específica
     */
    async getWalletAddress(url) {
        const client = await this.initializeClient();
        return await client.walletAddress.get({ url });
    }

    /**
     * Obtiene múltiples wallet addresses en paralelo
     */
    async getMultipleWalletAddresses(urls) {
        const client = await this.initializeClient();
        return await Promise.all(
            urls.map(url => client.walletAddress.get({ url }))
        );
    }

    // ============= GRANT OPERATIONS =============

    /**
     * Solicita un grant al servidor de autorización
     */
    async requestGrant(authServerUrl, grantRequest) {
        const client = await this.initializeClient();
        return await client.grant.request({ url: authServerUrl }, grantRequest);
    }

    /**
     * Continúa un grant pendiente usando URI de continuación
     */
    async continueGrant(continueUri, accessToken, additionalData = {}) {
        const client = await this.initializeClient();
        return await client.grant.continue({
            url: continueUri,
            accessToken: accessToken
        }, additionalData);
    }

    /**
     * Revoca un grant activo
     */
    async revokeGrant(manageUrl, accessToken) {
        const client = await this.initializeClient();
        return await client.grant.revoke({
            url: manageUrl,
            accessToken: accessToken
        });
    }

    // ============= SPECIFIC GRANT CREATORS =============

    /**
     * Crea un grant para pagos entrantes
     */
    async createIncomingPaymentGrant(walletAddress, actions = ["create", "read"]) {
        return await this.requestGrant(walletAddress.authServer, {
            access_token: {
                access: [{
                    type: "incoming-payment",
                    actions: actions
                }]
            }
        });
    }

    /**
     * Crea un grant para cotizaciones
     */
    async createQuoteGrant(walletAddress, actions = ["create", "read"]) {
        return await this.requestGrant(walletAddress.authServer, {
            access_token: {
                access: [{
                    type: "quote",
                    actions: actions
                }]
            }
        });
    }

    /**
     * Crea un grant para pagos salientes (no interactivo)
     */
    async createOutgoingPaymentGrant(walletAddress, limits = null, actions = ["create", "read"]) {
        const grantRequest = {
            access_token: {
                access: [{
                    type: "outgoing-payment",
                    actions: actions,
                    identifier: walletAddress.id,
                    ...(limits && { limits })
                }]
            }
        };

        return await this.requestGrant(walletAddress.authServer, grantRequest);
    }

    /**
     * Crea un grant interactivo para pagos salientes
     */
    async createInteractiveOutgoingPaymentGrant(walletAddress, limits, finishUri, nonce = null) {
        const generatedNonce = nonce || this.generateNonce();

        const grantRequest = {
            access_token: {
                access: [{
                    type: "outgoing-payment",
                    actions:  ["list", "list-all", "read", "read-all", "create"],
                    identifier: walletAddress.id,
                    limits: limits
                }]
            },
            interact: {
                start: ["redirect"],
                finish: {
                    method: "redirect",
                    uri: finishUri,
                    nonce: generatedNonce
                }
            }
        };

        const grant = await this.requestGrant(walletAddress.authServer, grantRequest);
        return { ...grant, nonce: generatedNonce };
    }

    /**
     * Crea grant para acceso a cuenta/wallet
     */
    async createWalletAddressGrant(walletAddress, actions = ["read"]) {
        return await this.requestGrant(walletAddress.authServer, {
            access_token: {
                access: [{
                    type: "wallet-address",
                    actions: actions,
                    identifier: walletAddress.id
                }]
            }
        });
    }

    // ============= PAYMENT OPERATIONS =============

    /**
     * Crea una solicitud de pago entrante
     */
    async createIncomingPayment(walletAddress, grant, paymentData) {
        const client = await this.initializeClientFor(walletAddress.id);

        console.log({
                url: walletAddress.resourceServer,
                accessToken: grant.access_token.value
            },
            paymentData)
        return await client.incomingPayment.create(
            {
                url: walletAddress.resourceServer,
                accessToken: grant.access_token.value
            },
            paymentData
        );
    }

    /**
     * Obtiene información de un pago entrante
     */
    async getIncomingPayment(resourceServer, paymentId, accessToken) {
        const client = await this.initializeClient();
        console.log(paymentId)
        return await client.incomingPayment.get({
            url: paymentId,
            accessToken: accessToken
        });
    }

    /**
     * Lista pagos entrantes
     */
    async listIncomingPayments(resourceServer, accessToken, options = {}) {
        const client = await this.initializeClient();
        return await client.incomingPayment.list({
            url: resourceServer,
            accessToken: accessToken
        }, options);
    }

    /**
     * Completa un pago entrante
     */
    async completeIncomingPayment(resourceServer, paymentId, accessToken) {
        const client = await this.initializeClient();
        console.log(paymentId)
        return await client.incomingPayment.complete({
            url: paymentId,
            accessToken: accessToken
        });
    }

    /**
     * Crea un pago saliente
     */
    async createOutgoingPayment(walletAddress, grant, paymentData) {
        const client = await this.initializeClientFor(walletAddress.id); // firma como sender
        return await client.outgoingPayment.create(
            {
                url: walletAddress.resourceServer,
                accessToken: grant.access_token.value
            },
            paymentData
        );
    }


    /**
     * Obtiene información de un pago saliente
     */
    async getOutgoingPayment(resourceServer, paymentId, accessToken) {
        const client = await this.initializeClient();
        return await client.outgoingPayment.get({
            url: `${resourceServer}/outgoing-payments/${paymentId}`,
            accessToken: accessToken
        });
    }

    /**
     * Lista pagos salientes
     */
    async listOutgoingPayments(resourceServer, accessToken, options = {}) {
        const client = await this.initializeClient();
        return await client.outgoingPayment.list({
            url: resourceServer,
            accessToken: accessToken
        }, options);
    }

    // ============= QUOTE OPERATIONS =============

    /**
     * Crea una cotización
     */
    async createQuote(resourceServer, grant, quoteData) {
        const client = await this.initializeClient();
        console.log({

            url: resourceServer,
                accessToken: grant.access_token.value
        },
        quoteData
        )
        return await client.quote.create(
            {
                url: resourceServer,
                accessToken: grant.access_token.value
            },
            quoteData
        );
    }

    /**
     * Obtiene información de una cotización
     */
    async getQuote(resourceServer, quoteId, accessToken) {
        const client = await this.initializeClient();
        return await client.quote.get({
            url: `${resourceServer}/quotes/${quoteId}`,
            accessToken: accessToken
        });
    }

    // ============= AUTHORIZATION FLOW HELPERS =============

    /**
     * Genera un nonce único para flujos de autorización
     */
    generateNonce() {
        return crypto.randomBytes(32).toString('base64url');
    }

    /**
     * Genera un identificador de sesión único
     */
    generateSessionId() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Verifica el hash de callback de autorización
     */
    verifyCallbackHash(receivedHash, nonce, interactRef) {
        const expectedHash = crypto
            .createHash('sha256')
            .update(nonce + interactRef)
            .digest('base64url');
        return receivedHash === expectedHash;
    }

    /**
     * Maneja el flujo completo de autorización para grant interactivo
     * @param {Object} walletAddress - Información de la billetera
     * @param {Object} limits - Límites del grant
     * @param {string} finishUri - URI donde regresar después de autorización
     * @param {string} [nonce] - Nonce personalizado (opcional)
     * @returns {Promise<Object>} Grant pendiente con información de redirección
     */
    async initiateAuthorizationFlow(walletAddress, limits, finishUri, nonce = null) {
        const grant = await this.createInteractiveOutgoingPaymentGrant(
            walletAddress,
            limits,
            finishUri,
            nonce
        );

        if (!isPendingGrant(grant)) {
            throw new Error('Expected pending grant for authorization flow');
        }

        return {
            grant,
            redirectUrl: grant.interact.redirect,
            continueUri: grant.continue.uri,
            continueToken: grant.continue.access_token.value,
            nonce: grant.nonce
        };
    }

    /**
     * Completa el flujo de autorización después del callback
     * @param {string} continueUri - URI para continuar el grant
     * @param {string} continueToken - Token para continuar el grant
     * @param {string} interactRef - Referencia de interacción del callback
     * @returns {Promise<Object>} Grant finalizado
     */
    async completeAuthorizationFlow(continueUri, continueToken, interactRef) {
        const grant = await this.continueGrant(continueUri, continueToken, {
            interact_ref: interactRef
        });

        if (!isFinalizedGrant(grant)) {
            throw new Error('Grant could not be finalized after authorization');
        }

        return grant;
    }

    /**
     * Flujo de autorización interactiva para consola (desarrollo/testing)
     */
    async manageConsoleAuth(walletAddress, limits, autoMode = false) {
        const nonce = this.generateNonce();
        const fakeFinishUri = 'http://localhost:3000/callback';

        const grant = await this.createInteractiveOutgoingPaymentGrant(
            walletAddress,
            limits,
            fakeFinishUri,
            nonce
        );

        console.log('\n🔗 URL de autorización:', grant.interact.redirect);
        console.log('📋 Información del grant:');
        console.log('   - Continue URI:', grant.continue.uri);
        console.log('   - Continue Token:', grant.continue.access_token.value);
        console.log('   - Nonce:', nonce);

        if (autoMode) {
            console.log('\n🔄 Modo automático activado, continuando en 3 segundos...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            return grant;
        }

        await this.waitForUserInput('\nPresione enter después de completar la autorización...');
        return grant;
    }

    /**
     * Utility para esperar input del usuario en consola
     */
    async waitForUserInput(message) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            rl.question(message, (answer) => {
                rl.close();
                resolve(answer);
            });
        });
    }

    // ============= UTILITY METHODS =============

    /**
     * Verifica si un grant está finalizado
     */
    isGrantFinalized(grant) {
        return isFinalizedGrant(grant);
    }

    /**
     * Verifica si un grant está pendiente
     */
    isGrantPending(grant) {
        return isPendingGrant(grant);
    }

    /**
     * Extrae información básica de un grant
     */
    extractGrantInfo(grant) {
        return {
            isFinalized: this.isGrantFinalized(grant),
            isPending: this.isGrantPending(grant),
            accessToken: grant.access_token?.value || null,
            manageUrl: grant.access_token?.manage || null,
            continueUri: grant.continue?.uri || null,
            continueToken: grant.continue?.access_token?.value || null,
            redirectUrl: grant.interact?.redirect || null,
            access: grant.access_token?.access || []
        };
    }
}

/**
 * Factory function para crear una instancia del servicio
 */
export function createOpenPaymentsService(config) {
    return new ClientOpenPaymentsService(config);
}

/**
 * Configuración por defecto para testing
 */
export const DEFAULT_TEST_CONFIG = {
    walletAddressUrl: "https://ilp.interledger-test.dev/client_test",
    keyId: "78a04592-e1c5-4da5-b00f-f7f8d8761c45",
    privateKey: fs.readFileSync(
        path.resolve(__dirname, "./..", "private.key"), // ajusta al nivel real
        "utf8"
    ),
    baseUrl: "http://localhost:3000"
};

export default ClientOpenPaymentsService;