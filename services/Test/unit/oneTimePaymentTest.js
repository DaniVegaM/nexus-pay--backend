// services/Test/TestInteractivePayment.js
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
    createOpenPaymentsService,
    DEFAULT_TEST_CONFIG
} from "../../ClientOpenPaymentsService.js";

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename);

function ask(q) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(res => rl.question(q, ans => { rl.close(); res(ans.trim()); }));
}

async function main() {
    // === 1) CONFIG ===
    // Ajusta estas 2 URLs de wallet según tu entorno
    const SENDER_WALLET_URL   = "https://ilp.interledger-test.dev/yisus19";
    const RECEIVER_WALLET_URL = "https://ilp.interledger-test.dev/client_test";

    // Si tu ClientOpenPaymentsService lee la llave desde config.privateKey (contenido PEM),
    // aquí puedes sobreescribir para evitar rutas frágiles:
    const cfg = {
        ...DEFAULT_TEST_CONFIG,
        // Ejemplo: si quieres pasar ruta absoluta a la llave:
        // privateKey: fs.readFileSync(path.resolve(__dirname, "../../private.key"), "utf8"),
        // O deja DEFAULT_TEST_CONFIG si ya es correcto en tu proyecto.
        baseUrl: "http://localhost:3000", // donde termina tu flujo (finish uri)
    };

    const ops = createOpenPaymentsService(cfg);

    // === 2) WALLETS ===
    console.log("📋 Obteniendo wallets...");
    const [sender, receiver] = await Promise.all([
        ops.getWalletAddress(SENDER_WALLET_URL),
        ops.getWalletAddress(RECEIVER_WALLET_URL),
    ]);

    // === 3) INCOMING PAYMENT (receptor) ===
    console.log("🔐 Creando grant para incoming payment (receptor)...");
    const inGrant = await ops.createIncomingPaymentGrant(receiver, ["create", "read"]);

    console.log("📥 Creando incoming payment...");
    const amountMinorUnits = 150; // <- ajusta el monto (en unidades mínimas)
    const incomingPayment = await ops.createIncomingPayment(
        receiver,
        inGrant,
        {
            walletAddress: receiver.id,
            incomingAmount: {
                assetCode: receiver.assetCode,
                assetScale: receiver.assetScale,
                value: String(amountMinorUnits),
            },
            // opcional: expiresAt, description, etc.
        }
    );

    // === 4) QUOTE (autorización del sender) ===
    console.log("🔐 Creando grant para quote (sender)...");
    const quoteGrant = await ops.createQuoteGrant(sender, ["create", "read"]);

    console.log("💰 Creando quote...");
    const quote = await ops.createQuote(
        receiver.resourceServer,
        quoteGrant,
        {
            walletAddress: sender.id,       // quién paga
            receiver: incomingPayment.id,   // incoming payment del receptor
            method: "ilp",
        }
    );

    // === 5) GRANT INTERACTIVO PARA OUTGOING-PAYMENT ===
    console.log("🔐 Creando grant interactivo (outgoing-payment)...");
    const limits = {
        debitAmount: {
            assetCode: sender.assetCode,
            assetScale: sender.assetScale,
            value: String(quote.debitAmount.value), // autoriza por lo que cobró el quote
        }
    };

    // finishUri: a dónde volverá el navegador tras autorizar. Debe ser consistente con tu backend de pruebas.
    const finishUri = `${cfg.baseUrl}/callback`;
    const { grant, redirectUrl, continueUri, continueToken, nonce } =
        await ops.initiateAuthorizationFlow(sender, limits, finishUri);

    console.log("\n🔗 Abre esta URL en el navegador y autoriza el pago:");
    console.log(redirectUrl);

    console.log("\nℹ️  Al finalizar, tu finishUri recibirá un `interact_ref`.");
    const interactRef = await ask("👉 Pega aquí el `interact_ref` del callback: ");

    console.log("⏭️  Continuando grant con interact_ref...");
    const finalizedGrant = await ops.completeAuthorizationFlow(continueUri, continueToken, interactRef);

    // === 6) OUTGOING PAYMENT (usa el grant finalizado) ===
    console.log("📤 Creando outgoing payment...");
    const outgoingPayment = await ops.createOutgoingPayment(
        sender,
        finalizedGrant,
        {
            walletAddress: sender.id,
            quoteId: quote.id
        }
    );


    // === 7) RESULTADOS ===
    console.log("\n✅ ¡Pago completado!");
    console.log("OutgoingPayment ID:", outgoingPayment.id);
    console.log("Estado:", outgoingPayment.state);
    console.log("DebitAmount:", outgoingPayment.debitAmount);
    console.log("CreditAmount:", outgoingPayment.creditAmount);
    console.log("\n🧾 Resumen:");
    console.log({
        sender: sender.id,
        receiver: receiver.id,
        incomingPayment: incomingPayment.id,
        quote: quote.id,
        outgoingPayment: outgoingPayment.id,
    });
}

main().catch(err => {
    console.error("❌ Error en test interactivo:", err?.message || err);
    process.exit(1);
});
