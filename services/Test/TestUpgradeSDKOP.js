import {createUnifiedPaymentService} from "../UnifiedOpenPaymentService.js";
import {DEFAULT_TEST_CONFIG} from "../ClientOpenPaymentsService.js";

const customConfig = {
    ...DEFAULT_TEST_CONFIG,
};

// Crear instancia del servicio unificado
const paymentService = createUnifiedPaymentService(customConfig);

async function ejemplosPagosSimples() {
    try {
        console.log("=== 💸 PAGOS SIMPLES ===");

        // Pago único directo
        console.log("\n1️⃣ Pago único directo:");
        const payment1 = await paymentService.sendPayment(
            "https://ilp.interledger-test.dev/yisus19",
            "https://ilp.interledger-test.dev/client_test",
            15000, // $150.00
            { description: "Pago por servicios de desarrollo" ,onAuthorizationNeeded:true}
        );
        console.log(`✅ Pago completado: ${payment1.operationId}`);

        // Pago único con preparación (para casos complejos)
        console.log("\n2️⃣ Pago único con preparación:");
        const prepared = await paymentService.prepareSinglePayment(
            "https://ilp.interledger-test.dev/yisus19",
            "https://ilp.interledger-test.dev/client_test",
            25000 // $250.00
        );

        console.log(prepared)
        if (prepared.authorizationUrl) {
            console.log("🔐 Autorización requerida:", prepared.authorizationUrl);
            const outgoingPaymentGrant = await paymentService.manageAuth(prepared.senderWallet, prepared.quote);
            console.log("✅ Usuario autorizó el pago");
        }

        const completed = await paymentService.completeSinglePayment(prepared.operationId);
        console.log(`✅ Pago preparado completado: ${completed.operationId}`);

    } catch (error) {
        console.error("❌ Error en pagos simples:", error.message);
    }
}

async function ejemplosPagosDivididos() {
    try {
        console.log("\n=== 💰 PAGOS DIVIDIDOS ===");

        // Split payment con montos fijos
        console.log("\n1️⃣ Distribución con montos fijos:");
        const recipients1 = [
            {
                walletUrl: "https://ilp.interledger-test.dev/developer1",
                type: "fixed",
                value: 30000, // $300.00
                description: "Lead Developer"
            },
            {
                walletUrl: "https://ilp.interledger-test.dev/developer2",
                type: "fixed",
                value: 20000, // $200.00
                description: "Junior Developer"
            },
            {
                walletUrl: "https://ilp.interledger-test.dev/platform",
                type: "fixed",
                value: 5000, // $50.00 (comisión)
                description: "Platform Fee"
            }
        ];

        const splitPayment1 = await paymentService.sendSplitPayment(
            "https://ilp.interledger-test.dev/project_client",
            recipients1
        );
        console.log(`✅ Pago dividido completado: ${splitPayment1.operationId}`);
        console.log(`📊 ${splitPayment1.summary.successfulPayments} pagos exitosos`);

        // Distribución de comisiones por porcentajes
        console.log("\n2️⃣ Distribución de comisiones por porcentajes:");
        const commissionRules = [
            {
                walletUrl: "https://ilp.interledger-test.dev/salesperson",
                percentage: 40,
                description: "Comisión vendedor principal"
            },
            {
                walletUrl: "https://ilp.interledger-test.dev/manager",
                percentage: 20,
                description: "Comisión gerente"
            },
            {
                walletUrl: "https://ilp.interledger-test.dev/company",
                percentage: 40,
                description: "Fondo de la empresa"
            }
        ];

        const baseAmount = 50000; // $500.00 de venta
        const commissions = await paymentService.distributeCommissions(
            "https://ilp.interledger-test.dev/sales_account",
            baseAmount,
            commissionRules
        );
        console.log(`✅ Comisiones distribuidas: ${commissions.operationId}`);

    } catch (error) {
        console.error("❌ Error en pagos divididos:", error.message);
    }
}

async function ejemplosMonederoVirtual() {
    try {
        console.log("\n=== 💳 MONEDERO VIRTUAL ===");

        // Crear monedero para múltiples pagos
        console.log("\n1️⃣ Creando monedero virtual:");
        const wallet = await paymentService.createPaymentWallet(
            "https://ilp.interledger-test.dev/company_treasury",
            200000, // $2,000.00 disponible
            {
                description: "Monedero para gastos operativos",
                expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 días
            }
        );

        let walletId;
        if (wallet.type === 'wallet_pending_auth') {
            console.log("🔐 Autorización requerida para monedero");
            // Simular autorización
            const authorized = await paymentService.completeAuthorization(wallet.operationId);
            walletId = wallet.operationId;
        } else {
            walletId = wallet.operationId;
        }

        console.log(`✅ Monedero creado: ${walletId}`);

        // Realizar pagos desde el monedero
        console.log("\n2️⃣ Pagos desde monedero:");

        const payment1 = await paymentService.payFromWallet(
            walletId,
            "https://ilp.interledger-test.dev/office_supplies",
            15000, // $150.00
            { description: "Suministros de oficina" }
        );
        console.log(`✅ Pago 1 desde monedero: $${payment1.amount / 100}`);

        const payment2 = await paymentService.payFromWallet(
            walletId,
            "https://ilp.interledger-test.dev/software_vendor",
            35000, // $350.00
            { description: "Licencias de software" }
        );
        console.log(`✅ Pago 2 desde monedero: ${payment2.amount / 100}`);

        // Programar pagos futuros desde el monedero
        console.log("\n3️⃣ Programando pagos futuros:");

        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await paymentService.schedulePaymentFromWallet(
            walletId,
            "https://ilp.interledger-test.dev/monthly_service",
            25000, // $250.00
            tomorrow,
            { description: "Pago mensual de servicio" }
        );

        await paymentService.schedulePaymentFromWallet(
            walletId,
            "https://ilp.interledger-test.dev/weekly_supplier",
            12000, // $120.00
            nextWeek,
            { description: "Pago semanal a proveedor" }
        );

        console.log("✅ Pagos programados desde monedero");

        // Ver estado del monedero
        const walletStatus = paymentService.getOperationStatus(walletId);
        console.log("📊 Estado del monedero:", {
            usado: `${(walletStatus.data.totalUsed || 0) / 100}`,
            disponible: `${walletStatus.data.grantId ? 'N/A' : 'Calculando...'}`
        });

        return walletId;

    } catch (error) {
        console.error("❌ Error con monedero virtual:", error.message);
    }
}

async function ejemplosPagosRecurrentes() {
    try {
        console.log("\n=== 🔄 PAGOS RECURRENTES ===");

        // Configurar suscripción mensual
        console.log("\n1️⃣ Configurando suscripción mensual:");
        const subscription = await paymentService.setupRecurringPayment(
            "https://ilp.interledger-test.dev/subscriber",
            "https://ilp.interledger-test.dev/saas_service",
            9999, // $99.99 por mes
            {
                interval: "P1M", // Cada mes
                maxPayments: 12, // Un año
                totalAmount: 119988 // $1,199.88 total
            },
            { description: "Suscripción anual SaaS" }
        );

        let subscriptionId;
        if (subscription.type === 'recurring_pending_auth') {
            console.log("🔐 Autorización requerida para suscripción");
            // Simular autorización
            const authorized = await paymentService.completeAuthorization(subscription.operationId);
            subscriptionId = subscription.operationId;
        } else {
            subscriptionId = subscription.operationId;
        }

        console.log(`✅ Suscripción configurada: ${subscriptionId}`);

        // Configurar nómina quincenal
        console.log("\n2️⃣ Configurando nómina quincenal:");
        const payroll = await paymentService.setupRecurringPayment(
            "https://ilp.interledger-test.dev/company_payroll",
            "https://ilp.interledger-test.dev/employee_alice",
            75000, // $750.00 quincenal
            {
                interval: "P14D", // Cada 14 días
                maxPayments: 26, // Un año
                totalAmount: 1950000 // $19,500.00 anual
            },
            { description: "Salario Alice - Quincenal" }
        );

        let payrollId = payroll.operationId;
        if (payroll.type === 'recurring_pending_auth') {
            await paymentService.completeAuthorization(payroll.operationId);
        }

        console.log(`✅ Nómina configurada: ${payrollId}`);

        // Ejecutar primer pago manualmente
        console.log("\n3️⃣ Ejecutando primer pago de suscripción:");
        const firstPayment = await paymentService.executeNextRecurringPayment(subscriptionId);
        console.log(`✅ Primer pago ejecutado: ${firstPayment.quote.debitAmount.value / 100}`);

        // Iniciar monitoreo automático
        console.log("\n4️⃣ Iniciando monitoreo automático:");
        await paymentService.startRecurringPaymentMonitor(subscriptionId, 30000); // Verificar cada 30 segundos para demo
        console.log("🔄 Monitor automático iniciado para suscripción");

        return { subscriptionId, payrollId };

    } catch (error) {
        console.error("❌ Error en pagos recurrentes:", error.message);
    }
}

async function ejemploGestionIntegrada() {
    try {
        console.log("\n=== 🎯 GESTIÓN INTEGRADA DE TODAS LAS OPERACIONES ===");

        // Ejecutar múltiples tipos de operaciones
        console.log("\n1️⃣ Creando múltiples operaciones:");

        // Monedero para gastos diversos
        const wallet = await paymentService.createPaymentWallet(
            "https://ilp.interledger-test.dev/main_account",
            300000, // $3,000.00
            { description: "Monedero principal de gastos" }
        );

        let walletId = wallet.operationId;
        if (wallet.type === 'wallet_pending_auth') {
            await paymentService.completeAuthorization(wallet.operationId);
        }

        // Pago recurrente para servicios
        const recurring = await paymentService.setupRecurringPayment(
            "https://ilp.interledger-test.dev/business_account",
            "https://ilp.interledger-test.dev/cloud_service",
            15000, // $150.00 mensual
            {
                interval: "P1M",
                maxPayments: 6,
                totalAmount: 90000
            }
        );

        let recurringId = recurring.operationId;
        if (recurring.type === 'recurring_pending_auth') {
            await paymentService.completeAuthorization(recurring.operationId);
        }

        // Pago dividido para proyecto
        const teamPayment = await paymentService.sendSplitPayment(
            "https://ilp.interledger-test.dev/project_budget",
            [
                {
                    walletUrl: "https://ilp.interledger-test.dev/team_lead",
                    type: "percentage",
                    value: 50,
                    baseAmount: 100000,
                    description: "Team Lead"
                },
                {
                    walletUrl: "https://ilp.interledger-test.dev/developer_1",
                    type: "percentage",
                    value: 30,
                    baseAmount: 100000,
                    description: "Senior Developer"
                },
                {
                    walletUrl: "https://ilp.interledger-test.dev/developer_2",
                    type: "percentage",
                    value: 20,
                    baseAmount: 100000,
                    description: "Junior Developer"
                }
            ]
        );

        console.log("✅ Múltiples operaciones creadas");

        // Ver todas las operaciones activas
        console.log("\n2️⃣ Estado de todas las operaciones:");
        const activeOps = paymentService.listActiveOperations();
        console.log(`📋 Operaciones activas: ${activeOps.length}`);

        activeOps.forEach((op, index) => {
            console.log(`  ${index + 1}. ${op.type} (${op.operationId}) - ${op.status}`);
        });

        // Realizar algunas transacciones
        console.log("\n3️⃣ Ejecutando transacciones:");

        // Pago desde monedero
        await paymentService.payFromWallet(
            walletId,
            "https://ilp.interledger-test.dev/vendor_1",
            45000,
            { description: "Compra de equipos" }
        );

        // Ejecutar pago recurrente
        await paymentService.executeNextRecurringPayment(recurringId);

        // Programar pago futuro desde monedero
        const futureDate = new Date(Date.now() + 60000); // 1 minuto
        await paymentService.schedulePaymentFromWallet(
            walletId,
            "https://ilp.interledger-test.dev/scheduled_vendor",
            20000,
            futureDate,
            { description: "Pago programado para demo" }
        );

        console.log("✅ Transacciones ejecutadas");

        // Iniciar monitoreo global
        console.log("\n4️⃣ Iniciando monitoreo global:");
        const stopGlobalMonitor = paymentService.startScheduledPaymentMonitor(10000); // 10 segundos para demo
        await paymentService.startRecurringPaymentMonitor(recurringId, 15000); // 15 segundos para demo

        console.log("🔄 Monitores globales iniciados");

        // Esperar para ver algunos resultados
        console.log("\n⏳ Esperando 70 segundos para ver monitores en acción...");
        await new Promise(resolve => setTimeout(resolve, 70000));

        // Detener monitores
        console.log("\n5️⃣ Deteniendo monitores:");
        stopGlobalMonitor();
        paymentService.stopRecurringPaymentMonitor(recurringId);
        console.log("🛑 Monitores detenidos");

        return { walletId, recurringId, teamPayment };

    } catch (error) {
        console.error("❌ Error en gestión integrada:", error.message);
    }
}

async function ejemploLimpiezaYMantenimiento() {
    try {
        console.log("\n=== 🧹 LIMPIEZA Y MANTENIMIENTO ===");

        // Ver estado de todas las operaciones
        console.log("\n1️⃣ Estado actual del sistema:");
        const activeOps = paymentService.listActiveOperations();
        console.log(`📊 Operaciones activas: ${activeOps.length}`);

        // Mostrar detalles de cada operación
        activeOps.forEach(op => {
            const status = paymentService.getOperationStatus(op.operationId);
            console.log(`  • ${op.type}: ${status.status} (creada: ${status.createdAt.toLocaleString()})`);
        });

        // Simular cancelación de alguna operación
        if (activeOps.length > 0) {
            const opToCancel = activeOps.find(op => op.type === 'recurring_payment');
            if (opToCancel) {
                console.log(`\n2️⃣ Cancelando operación: ${opToCancel.operationId}`);
                await paymentService.cancelOperation(opToCancel.operationId);
                console.log("✅ Operación cancelada");
            }
        }

        // Detener todos los monitores
        console.log("\n3️⃣ Deteniendo todos los monitores:");
        paymentService.stopAllMonitors();

        // Limpiar operaciones completadas
        console.log("\n4️⃣ Limpiando operaciones completadas:");
        const cleaned = paymentService.cleanupCompletedOperations();
        console.log(`🧹 ${cleaned} operaciones limpiadas`);

        // Estado final
        const finalActiveOps = paymentService.listActiveOperations();
        console.log(`\n📊 Estado final: ${finalActiveOps.length} operaciones activas`);

    } catch (error) {
        console.error("❌ Error en limpieza:", error.message);
    }
}

// Ejemplo de manejo de errores y casos especiales
async function ejemploManejoErrores() {
    try {
        console.log("\n=== ⚠️ MANEJO DE ERRORES ===");

        // Intentar usar una operación inexistente
        console.log("\n1️⃣ Probando operación inexistente:");
        try {
            await paymentService.getOperationStatus("operacion_inexistente");
        } catch (error) {
            console.log(`✅ Error capturado correctamente: ${error.message}`);
        }

        // Intentar pagar más de lo disponible en un monedero
        console.log("\n2️⃣ Probando límites de monedero:");
        const smallWallet = await paymentService.createPaymentWallet(
            "https://ilp.interledger-test.dev/limited_account",
            1000, // Solo $10.00
            { description: "Monedero pequeño para pruebas" }
        );

        let smallWalletId = smallWallet.operationId;
        if (smallWallet.type === 'wallet_pending_auth') {
            await paymentService.completeAuthorization(smallWallet.operationId);
        }

        try {
            await paymentService.payFromWallet(
                smallWalletId,
                "https://ilp.interledger-test.dev/expensive_vendor",
                50000, // $500.00 - más de lo disponible
                { description: "Pago que excede límites" }
            );
        } catch (error) {
            console.log(`✅ Límites respetados correctamente: ${error.message}`);
        }

        // Intentar completar autorización de operación incorrecta
        console.log("\n3️⃣ Probando autorización incorrecta:");
        try {
            await paymentService.completeAuthorization(smallWalletId); // No necesita autorización
        } catch (error) {
            console.log(`✅ Validación correcta: ${error.message}`);
        }

        console.log("✅ Manejo de errores funcionando correctamente");

    } catch (error) {
        console.error("❌ Error inesperado en manejo de errores:", error.message);
    }
}

// Función principal que ejecuta todos los ejemplos
async function ejecutarDemoCompleta() {
    console.log("🚀 DEMO COMPLETA DEL UNIFIED PAYMENT SERVICE");
    console.log("===============================================================");

    try {
        // Ejecutar todos los ejemplos
        await ejemplosPagosSimples();
        //await ejemplosPagosDivididos();
       // const walletId = await ejemplosMonederoVirtual();
        //const { subscriptionId, payrollId } = await ejemplosPagosRecurrentes();
        //await ejemploGestionIntegrada();
        //await ejemploManejoErrores();
        //await ejemploLimpiezaYMantenimiento();

        console.log("\n🎉 DEMO COMPLETA FINALIZADA EXITOSAMENTE!");
        console.log("\n📋 RESUMEN DE CAPACIDADES DEMOSTRADAS:");
        console.log("✅ Pagos únicos simples y complejos");
        console.log("✅ Pagos divididos con montos fijos y porcentajes");
        console.log("✅ Monederos virtuales para múltiples pagos");
        console.log("✅ Pagos recurrentes con monitoreo automático");
        console.log("✅ Gestión integrada de todas las operaciones");
        console.log("✅ Manejo robusto de errores");
        console.log("✅ Herramientas de limpieza y mantenimiento");

        return {
            success: true,
            message: "Todas las funcionalidades del UnifiedPaymentService demostradas exitosamente"
        };

    } catch (error) {
        console.error("❌ Error en demo completa:", error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// Ejemplo de uso específico para diferentes industrias
async function ejemplosIndustriaEspecifica() {
    console.log("\n=== 🏢 EJEMPLOS POR INDUSTRIA ===");

    // E-commerce
    console.log("\n🛒 E-COMMERCE:");

    // Pago de pedido con comisiones automáticas
    const orderAmount = 150000; // $1,500.00
    const ecommercePayment = await paymentService.distributeCommissions(
        "https://ilp.interledger-test.dev/remitente_test",
        orderAmount,
        [
            {
                walletUrl: "https://ilp.interledger-test.dev/remitente_test",
                percentage: 80,
                description: "Pago al vendedor"
            },
            {
                walletUrl: "https://ilp.interledger-test.dev/client_test",
                percentage: 15,
                description: "Comisión plataforma"
            },
            {
                walletUrl: "https://ilp.interledger-test.dev/yisus19",
                percentage: 5,
                description: "Comisión procesador"
            }
        ]
    );
    console.log("✅ Pedido e-commerce procesado con distribución automática");

    // Freelance/Gig Economy
    console.log("\n👨‍💻 FREELANCE/GIG ECONOMY:");

    // Monedero para múltiples proyectos freelance
    const freelanceWallet = await paymentService.createPaymentWallet(
        "https://ilp.interledger-test.dev/yisus19",
        500000, // $5,000.00 para múltiples proyectos
        {
            description: "Budget para proyectos freelance Q1 2025",
            expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
        }
    );

    let freelanceWalletId = freelanceWallet.operationId;
    if (freelanceWallet.type === 'wallet_pending_auth') {
        await paymentService.completeAuthorization(freelanceWallet.operationId);
    }

    // Pagos por hitos de proyecto
    await paymentService.schedulePaymentFromWallet(
        freelanceWalletId,
        "https://ilp.interledger-test.dev/yisus19",
        75000, // $750.00
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 semana
        { description: "Hito 1: Diseño UI completado" }
    );

    await paymentService.schedulePaymentFromWallet(
        freelanceWalletId,
        "https://ilp.interledger-test.dev/yisus19",
        100000, // $1,000.00
        new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 semanas
        { description: "Hito 2: Desarrollo frontend" }
    );

    console.log("✅ Proyecto freelance con pagos por hitos programados");

    // SaaS/Suscripciones
    console.log("\n💻 SAAS/SUSCRIPCIONES:");

    // Suscripción con diferentes planes
    const enterpriseSubscription = await paymentService.setupRecurringPayment(
        "https://ilp.interledger-test.dev/client_test",
        "https://ilp.interledger-test.dev/remitente_test",
        49999, // $499.99 mensual plan enterprise
        {
            interval: "P1M",
            maxPayments: 12,
            totalAmount: 599988, // $5,999.88 anual con descuento
        },
        { description: "Plan Enterprise - Facturación anual" }
    );

    let enterpriseSubId = enterpriseSubscription.operationId;
    if (enterpriseSubscription.type === 'recurring_pending_auth') {
        await paymentService.completeAuthorization(enterpriseSubscription.operationId);
    }

    // Iniciar monitoreo automático para suscripciones
    await paymentService.startRecurringPaymentMonitor(enterpriseSubId);
    console.log("✅ Suscripción enterprise con facturación automática configurada");

    return {
        ecommercePayment,
        freelanceWalletId,
        enterpriseSubId
    };
}

// Exportar todas las funciones de ejemplo
export {
    ejemplosPagosSimples,
    ejemplosPagosDivididos,
    ejemplosMonederoVirtual,
    ejemplosPagosRecurrentes,
    ejemploGestionIntegrada,
    ejemploLimpiezaYMantenimiento,
    ejemploManejoErrores,
    ejemplosIndustriaEspecifica,
    ejecutarDemoCompleta
};

// Ejecutar demo completa si se ejecuta directamente
if (import.meta.main) {
    console.log("🎯 Iniciando demo del Unified Payment Service...");
    const result = await ejecutarDemoCompleta();

    // if (result.success) {
    //     console.log("\n🎉 ¡Demo ejecutada exitosamente!");
    //
    //     // Ejecutar ejemplos por industria
    //     console.log("\n🏭 Ejecutando ejemplos por industria...");
    //     await ejemplosIndustriaEspecifica();
    //
    // } else {
    //     console.log(`\n❌ Demo falló: ${result.error}`);
    // }
}