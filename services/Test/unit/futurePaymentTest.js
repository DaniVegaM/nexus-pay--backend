// services/Test/TestFuturePaymentFlow.js
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createFuturePaymentService } from "../../FuturePaymentService.js";
import { DEFAULT_TEST_CONFIG } from "../../ClientOpenPaymentsService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ask(q) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(res => rl.question(q, ans => { rl.close(); res(ans.trim()); }));
}

async function main() {
    // === Configura tus wallets y monto (en unidades mínimas) ===
    const SENDER_WALLET_URL   = "https://ilp.interledger-test.dev/yisus19";
    const RECEIVER_WALLET_URL = "https://ilp.interledger-test.dev/client_test";
    const AMOUNT_MINOR_UNITS  = 150; // p.ej. 150 = $1.50 si assetScale=2

    // Opcional: sobreescribe baseUrl/llave si lo necesitas
    const cfg = {
        ...DEFAULT_TEST_CONFIG,
        // Si tu DEFAULT_TEST_CONFIG ya carga bien la llave privada, déjalo así.
        // Si prefieres ruta absoluta a la llave, descomenta:
        // privateKey: fs.readFileSync(path.resolve(__dirname, "../../private.key"), "utf8"),
        baseUrl: "http://localhost:3000" // se usará para construir el finishUri
    };

    const fps = createFuturePaymentService(cfg);

    // === 1) Crear grant para pagos futuros (interactivo) ===
    const grantReq = {
        senderWalletUrl: SENDER_WALLET_URL,
        limits: {
            totalAmount: AMOUNT_MINOR_UNITS * 10, // autoriza hasta 10 veces el monto de ejemplo
            interval: "R/2025-01-01T00:00:00Z/P1D" // opcional, si quieres recurrente por intervalo
        },
        // expiresAt: "2025-12-31T23:59:59Z", // opcional
        description: "Grant de pruebas para pagos futuros"
    };

    console.log("🔐 Creando grant para pagos futuros...");
    const prepared = await fps.createFuturePaymentGrant(grantReq);

    console.log("\n🔗 Abre esta URL para autorizar el grant:");
    console.log(prepared.authorizationUrl);

    console.log("\nℹ️  Tras autorizar, tu finishUri recibirá un parámetro `interact_ref`.");
    const interactRef = await ask("👉 Pega aquí el `interact_ref` del callback: ");

    // === 2) Finalizar setup del grant ===
    console.log("\n⏭️  Finalizando configuración del grant...");
    const finalized = await fps.finalizeGrantSetup(prepared.grantId, interactRef);

    console.log("\n✅ Grant activo:");
    console.log(finalized);


    // === 4) (Opcional) Listar estado de grants/pagos programados ===
    console.log("\n📊 Estado del grant:");
    console.log(fps.getGrantStatus(prepared.grantId));
}

main().catch(err => {
    console.error("❌ Error en TestFuturePaymentFlow:", err?.message || err);
    process.exit(1);
});
