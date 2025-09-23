// direct-callback-split-payment.js
import express from 'express';
import { createSplitPaymentService } from '../services/SplitPaymentService.js';

const router = express.Router();
const splitPaymentService = createSplitPaymentService();

/**
 * Endpoint principal: Crear split payment
 * POST /split-payment/create-and-execute
 */
router.post('/incoming-payment', async (req, res) => {
    try {
        const splitRequest = req.body;

        if(!splitRequest.recipientWallet || !splitRequest.value){
            throw new Error("Request mal");
        }

        // Crear split payment
        const incomingPayment = await splitPaymentService.generateLinkPayment(splitRequest.recipientWallet,splitRequest.value,splitRequest.description="pago");

        console.log(`Split payment creado: ${incomingPayment.id}`);

        // Responder inmediatamente con la URL de autorización
        res.json({
            success: true,
            data: {
                incomingPayment: incomingPayment.id,
                status: 'incoming payment created',
                message: 'Send link to sender',
            }
        });

    } catch (error) {
        console.error('Error creando split payment:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


/**
 * Endpoint principal: Crear split payment
 * POST /split-payment/create-and-execute
 */
router.post('/split-payment/create-and-execute', async (req, res) => {
    try {
        const splitRequest = req.body;
        console.log('Creando split payment para ejecución automática...');

        // Crear split payment
        const created = await splitPaymentService.createSplitPayment(splitRequest);

        console.log(`Split payment creado: ${created.splitId}`);

        // Responder inmediatamente con la URL de autorización
        res.json({
            success: true,
            data: {
                splitId: created.splitId,
                status: 'authorization_required',
                authorizationUrl: created.authorizationUrl,
                message: 'Autoriza el pago en el navegador. Serás redirigido automáticamente cuando se complete.',
                splitInfo: created.splitInfo
            }
        });

    } catch (error) {
        console.error('Error creando split payment:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Callback que ejecuta automáticamente el split payment
 * GET /split-payment/callback/:splitId?interact_ref=xxx&hash=yyy
 */
router.get('/split-payment/callback/:splitId', async (req, res) => {
    const { splitId } = req.params;
    const { interact_ref, hash } = req.query;

    console.log(`Procesando callback para ${splitId} con interact_ref: ${interact_ref}`);

    try {
        // 1. Activar el split payment
        console.log(`Activando split payment ${splitId}...`);
        await splitPaymentService.activateSplitPayment(splitId, interact_ref);

        // 2. Ejecutar inmediatamente
        console.log(`Ejecutando split payment ${splitId}...`);
        const result = await splitPaymentService.executeSplitPayment(splitId);

        console.log(`Split payment completado: ${result.status}`);
        console.log(`Exitosos: ${result.executionSummary.successfulPayments}/${result.executionSummary.totalRecipients}`);

        // 3. Redirigir al frontend con resultado
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173/dashboard';

        if (result.status === 'completed') {
            const successUrl = `${frontendUrl}?success=true`;
            res.redirect(successUrl);
        } else if (result.status === 'partially_completed') {
            const partialUrl = `${frontendUrl}?success=partially`;
            res.redirect(partialUrl);
        } else {
            const failedUrl = `${frontendUrl}?success=false`;
            res.redirect(failedUrl);
        }

    } catch (error) {
        console.error(`Error procesando callback para ${splitId}:`, error.message);

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4000';
        const errorUrl = `${frontendUrl}/split-payment/error?splitId=${splitId}&error=${encodeURIComponent(error.message)}`;
        res.redirect(errorUrl);
    }
});

/**
 * Endpoint para obtener estado de un split payment
 * GET /split-payment/:splitId/status
 */
router.get('/split-payment/:splitId/status', (req, res) => {
    const { splitId } = req.params;

    try {
        const status = splitPaymentService.getSplitPaymentStatus(splitId);

        if (!status) {
            return res.status(404).json({
                success: false,
                error: 'Split payment not found'
            });
        }

        res.json({
            success: true,
            data: status
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Endpoint para listar split payments
 * GET /split-payments?status=completed
 */
router.get('/split-payments/status', (req, res) => {
    const { status } = req.params;

    try {
        const payments = splitPaymentService.listSplitPayments(status);

        res.json({
            success: true,
            data: payments,
            count: payments.length
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Endpoint para reintentar pagos fallidos
 * POST /split-payment/:splitId/retry
 */
router.post('/split-payment/:splitId/retry', async (req, res) => {
    const { splitId } = req.params;
    const { failedIndexes } = req.body; // Array opcional de índices a reintentar

    try {
        console.log(`Reintentando pagos fallidos para ${splitId}...`);
        const result = await splitPaymentService.retryFailedPayments(splitId, failedIndexes);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error(`Error en reintentos para ${splitId}:`, error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Endpoint para cancelar un split payment
 * POST /split-payment/:splitId/cancel
 */
router.post('/split-payment/:splitId/cancel', async (req, res) => {
    const { splitId } = req.params;

    try {
        await splitPaymentService.cancelSplitPayment(splitId);

        res.json({
            success: true,
            message: 'Split payment cancelado',
            data: { splitId }
        });

    } catch (error) {
        console.error(`Error cancelando ${splitId}:`, error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;

// ===============================
// EJEMPLO DE USO COMPLETO
// ===============================

/*
// app.js
import express from 'express';
import cors from 'cors';
import directCallbackRouter from './direct-callback-split-payment.js';

const app = express();

app.use(cors());
app.use(express.json());

// Montar el router
app.use('/', directCallbackRouter);

app.listen(3000, () => {
    console.log('Servidor con split payments automáticos en puerto 3000');
    console.log('Endpoints disponibles:');
    console.log('  POST /split-payment/create-and-execute - Crear y configurar para ejecución automática');
    console.log('  GET  /split-payment/callback/:id - Callback automático (no llamar manualmente)');
    console.log('  GET  /split-payment/:id/status - Ver estado del split payment');
    console.log('  GET  /split-payments - Listar todos los split payments');
    console.log('  POST /split-payment/:id/retry - Reintentar pagos fallidos');
    console.log('  POST /split-payment/:id/cancel - Cancelar split payment');
});

export default app;
*/

// ===============================
// EJEMPLO DE REQUEST
// ===============================

/*
POST http://localhost:3000/split-payment/create-and-execute
Content-Type: application/json

{
  "senderWalletUrl": "https://ilp.interledger-test.dev/alice",
  "recipients": [
    {
      "walletUrl": "https://ilp.interledger-test.dev/bob",
      "type": "fixed",
      "value": 15000,
      "description": "Pago para Bob"
    },
    {
      "walletUrl": "https://ilp.interledger-test.dev/charlie",
      "type": "remaining",
      "description": "Resto para Charlie"
    }
  ],
  "totalAmount": "45000",
  "description": "Split payment automático"
}
*/

// ===============================
// RESPUESTA INMEDIATA
// ===============================

/*
{
  "success": true,
  "data": {
    "splitId": "split_1234567890_abc123",
    "status": "authorization_required",
    "authorizationUrl": "https://auth.interledger-test.dev/authorize?...",
    "message": "Autoriza el pago en el navegador. Serás redirigido automáticamente cuando se complete.",
    "splitInfo": {
      "senderWallet": "https://ilp.interledger-test.dev/alice",
      "totalAmount": 45000,
      "recipientCount": 2,
      "recipients": [...]
    }
  }
}
*/

// ===============================
// FLUJO COMPLETO
// ===============================

/*
1. Cliente llama POST /split-payment/create-and-execute
2. Servidor responde inmediatamente con authorizationUrl
3. Usuario abre authorizationUrl en navegador y autoriza
4. Usuario es redirigido automáticamente a /split-payment/callback/:splitId?interact_ref=xxx
5. Servidor automáticamente:
   - Activa el split payment con el interact_ref
   - Ejecuta todos los pagos
   - Redirige al usuario con el resultado final
6. Usuario ve página de éxito/error en el frontend

NO HAY POLLING NI ESPERA MANUAL - TODO ES AUTOMÁTICO DESPUÉS DE LA AUTORIZACIÓN
*/

// ===============================
// CÓDIGO JAVASCRIPT PARA CLIENTE
// ===============================

/*
async function createAutomaticSplitPayment() {
  const splitRequest = {
    senderWalletUrl: "https://ilp.interledger-test.dev/alice",
    recipients: [
      {
        walletUrl: "https://ilp.interledger-test.dev/bob",
        type: "fixed",
        value: 15000,
        description: "Pago A"
      },
      {
        walletUrl: "https://ilp.interledger-test.dev/charlie",
        type: "remaining",
        description: "Resto para B"
      }
    ],
    totalAmount: "45000",
    description: "Split automático"
  };

  try {
    console.log("Creando split payment automático...");

    const response = await fetch('http://localhost:3000/split-payment/create-and-execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(splitRequest)
    });

    const result = await response.json();

    if (result.success) {
      console.log(`Split creado: ${result.data.splitId}`);
      console.log("Abre esta URL para autorizar:");
      console.log(result.data.authorizationUrl);
      console.log("El pago se ejecutará automáticamente después de autorizar.");

      return result.data;
    } else {
      throw new Error(result.error);
    }

  } catch (error) {
    console.error("Error:", error.message);
    throw error;
  }
}

// Usar la función
createAutomaticSplitPayment();
*/