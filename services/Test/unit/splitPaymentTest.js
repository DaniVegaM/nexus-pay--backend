// TestSplitPaymentService.js
// Ejecuta: node TestSplitPaymentService.js
import readline from "node:readline";
import { fileURLToPath } from "url";
import path from "path";

import { DEFAULT_TEST_CONFIG } from "../../ClientOpenPaymentsService.js";
import { createSplitPaymentService } from "../../SplitPaymentService.js";

// -------- util de consola --------
function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

function pretty(obj) {
    return JSON.stringify(obj, null, 2);
}

// --------- puedes ajustar aquí tus wallets de prueba ----------
const SENDER_WALLET = process.env.SENDER_WALLET || "https://ilp.interledger-test.dev/yisus19";
const RECIPIENT_A    = process.env.RECIPIENT_A    || "https://ilp.interledger-test.dev/client_test";
const RECIPIENT_B    = process.env.RECIPIENT_B    || "https://ilp.interledger-test.dev/danivega";
// totalAmount se usa para calcular porcentajes y también para el límite del grant
const TOTAL_AMOUNT   = Number(process.env.SPLIT_TOTAL || 300000);

// Por si quieres sobreescribir clave/ids por env:
const CONFIG = {
    ...DEFAULT_TEST_CONFIG,
    walletAddressUrl: process.env.WALLET_ADDRESS_URL || DEFAULT_TEST_CONFIG.walletAddressUrl,
    keyId: process.env.KEY_ID || DEFAULT_TEST_CONFIG.keyId,
    privateKey: process.env.PRIVATE_KEY || DEFAULT_TEST_CONFIG.privateKey,
    baseUrl: process.env.BASE_URL || DEFAULT_TEST_CONFIG.baseUrl
};

async function main() {
    console.log("🧪 Test: SplitPaymentService end-to-end\n");

    // 1) Instanciar servicio
    const splitService = createSplitPaymentService(CONFIG);

    // 2) Definir split: un receptor fijo y otro por porcentaje (resto)
    const splitRequest = {
        senderWalletUrl: SENDER_WALLET,
        recipients: [
            {
                walletUrl: RECIPIENT_A,
                value: 15000, // MXN 150 al primer receptor
                description: "Pago fijo A",
                priority: 1,
            },
            {
                walletUrl: RECIPIENT_B,
                description: "Resto para B",
                value:4000,
                priority: 2
            }
            // Si prefieres porcentaje: { walletUrl: RECIPIENT_B, type: "percentage", value: 50 }
        ],
        totalAmount: TOTAL_AMOUNT,
        description: "Split de prueba via SplitPaymentService",
        execution: {
            parallel: true,
            stopOnError: false,
            maxConcurrent: 5
        }
    };

    // 3) Crear split (esto pide un grant interactivo de outgoing del sender)
    console.log("▶️  Creando split payment...");
    const created = await splitService.createSplitPayment(splitRequest);
    console.log("✅ Split creado (pendiente autorización):");
    console.log(pretty({
        splitId: created.splitId,
        authorizationUrl: created.authorizationUrl,
        continueInfo: created.continueInfo,
        splitInfo: created.splitInfo
    }));

    console.log("\n🔗 Abre esta URL en el navegador y autoriza el pago:");
    console.log(created.authorizationUrl);
    console.log("Tras autorizar, serás redirigido a tu finishUri. Copia el parámetro `interact_ref` de esa URL.\n");

    // 4) Esperar interact_ref del usuario
    const interactRef = await ask("Pega aquí el interact_ref: ");

    // 5) Activar el split (finaliza el grant long-lived del sender)
    console.log("\n▶️  Activando split payment...");
    const activated = await splitService.activateSplitPayment(created.splitId, interactRef);
    console.log("✅ Split activado y listo para ejecutar:");
    console.log(pretty(activated));

    // 6) Ejecutar el split (crea incoming para cada receptor, quote en RS del receptor, y outgoing del sender)
    console.log("\n🚀 Ejecutando split payment...");
    const result = await splitService.executeSplitPayment(created.splitId);
    console.log("🏁 Resultado de ejecución:");
    console.log(pretty(result));

    // 7) Estado final
    const status = splitService.getSplitPaymentStatus(created.splitId);
    console.log("\n📊 Estado final del split:");
    console.log(pretty(status));

    console.log("\n✅ Test completo.");
}

// Sugerencia de compatibilidad de rutas si ejecutas desde otro directorio
// (no es imprescindible, pero ayuda si importas llaves por archivo):
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
process.chdir(__dirname);

main().catch(err => {
    console.error("\n❌ Error en TestSplitPaymentService:", err?.message || err);
    if (err?.response?.data) {
        console.error("Detalles del backend:", pretty(err.response.data));
    }
    process.exit(1);
});
