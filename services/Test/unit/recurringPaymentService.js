// services/Test/TestRecurringPaymentFlow.js
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createRecurringPaymentService } from "../../RecurringPaymentService.js";
import { DEFAULT_TEST_CONFIG } from "../../ClientOpenPaymentsService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ask(q) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(res => rl.question(q, ans => { rl.close(); res(ans.trim()); }));
}

async function main() {

    // === Ajusta estas URLs y montos (unidades mínimas) ===
    const SENDER_WALLET_URL   = "https://ilp.interledger-test.dev/yisus19";
    const RECEIVER_WALLET_URL = "https://ilp.interledger-test.dev/client_test";
    const AMOUNT_PER_PAYMENT  = 150;           // p.ej. 150 = $1.50 si assetScale=2
    const TOTAL_BUDGET        = AMOUNT_PER_PAYMENT * 5; // autoriza hasta 5 pagos

    // Intervalo ISO 8601 corto para pruebas (1 minuto). Cambia a P1D / P1W / etc. en prod.
    const INTERVAL_ISO = "PT1M";

    // Si tu DEFAULT_TEST_CONFIG ya carga bien la llave, no toques esto.
    const cfg = {
        ...DEFAULT_TEST_CONFIG,
        baseUrl: "http://localhost:3000", // se usa para construir finishUri interno del servicio
    };

    const rps = createRecurringPaymentService(cfg);

    // === 1) Crear pago recurrente (solicita autorización) ===
    const recurringRequest = {
        senderWalletUrl: SENDER_WALLET_URL,
        receiverWalletUrl: RECEIVER_WALLET_URL,
        amount: String(AMOUNT_PER_PAYMENT),
        totalBudget: String(TOTAL_BUDGET),
        schedule: {
            interval: INTERVAL_ISO,
            // startDate opcional; si lo omites arrancará “ahora”
            // startDate: new Date(Date.now() + 30_000).toISOString(), // 30s en el futuro (ejemplo)
            // endDate: ...,
            // maxPayments: 5,
        },
        incomingAmount:{
            value:"1000",
            assetCode:"MXN",
            assetScale:2
        },
        expiresAt:new Date(Date.now() + 60_000 * 10).toISOString(),
        description: "Recurrent test via RecurringPaymentService",
    };

    console.log("🔄 Creando pago recurrente...");
    const created = await rps.createRecurringPayment(recurringRequest);

    console.log("\n🔗 Abre esta URL para autorizar el grant del pago recurrente:");
    console.log(created.authorizationUrl);

    console.log("\nℹ️  Tras autorizar, tu finishUri recibirá un parámetro `interact_ref`.");
    const interactRef = await ask("👉 Pega aquí el `interact_ref` del callback: ");

    // === 2) Activar el pago recurrente (finaliza el grant) ===
    console.log("\n⏭️  Activando el pago recurrente...");
    const activated = await rps.activateRecurringPayment(created.recurringId, interactRef);
    console.log("\n✅ Recurrente activo:");
    console.log(activated);

    // === 3) Ejecutar un pago inmediato para validar (forzado) ===
    console.log("\n⚡ Ejecutando un pago ahora (force=true) para validar el flujo...");
    const firstRun = await rps.executeRecurringPayment(created.recurringId, true);
    console.log("\n✅ Pago ejecutado:");
    console.log({
        recurringId: firstRun.recurringId,
        paymentNumber: firstRun.paymentNumber,
        outgoingPaymentId: firstRun.paymentId,
        debitAmount: firstRun.paymentDetails.debitAmount,
        receiveAmount: firstRun.paymentDetails.receiveAmount,
        nextPaymentDate: firstRun.recurringStatus.nextPaymentDate,
        remainingBudget: firstRun.recurringStatus.remainingBudget,
    });

    // === 4) (Opcional) Arrancar monitor automático breve (30s) ===
    const startAuto = await ask("\n¿Quieres probar la ejecución automática durante 30s? (y/N): ");
    if (startAuto.toLowerCase() === "y") {
        console.log("⏰ Iniciando monitor automático cada 10s (solo demo)...");
        const stop = rps.startAutomaticExecution(created.recurringId, 10_000);

        await new Promise(res => setTimeout(res, 30_000)); // espera 30s para ver al menos 1 ciclo
        stop();
        console.log("🛑 Monitor automático detenido.");

        console.log("\n📜 Historial reciente:");
        console.log(rps.getPaymentHistory(created.recurringId, 10));
    }

    // === 5) Estado final ===
    console.log("\n📊 Estado del pago recurrente:");
    console.log(rps.getRecurringPaymentStatus(created.recurringId));
}

main().catch(err => {
    console.error("❌ Error en TestRecurringPaymentFlow:", err?.message || err);
    process.exit(1);
});
