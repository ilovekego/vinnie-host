const express = require('express');
const router = express.Router();
const axios = require('axios');
const { User } = require('../models/User');

const DARAJA = {
    consumerKey: "AuWTRFgxHzuRusxhzBVcveFSomXrA8LxnOBD3IXTnuHoZSLJ",
    consumerSecret: "sWeIfty8YxG4JaZGO36V9y2BLhwQCTjmWUO9cdpTA8uAUL75x5OkPFNVLMkX0Ktr",
    shortCode: "4046007",
    passkey: "fe0c17ce50541202813bd1fc5ffe711d88fb291fce86ef77b8c6d2a90df80f82",
    callbackUrl: "https://apis.vinniedigitalhub.co.ke/finance/mpesa/callback",
    baseUrl: "https://api.safaricom.co.ke"
};

// Generate Daraja OAuth Token
const getDarajaToken = async () => {
    const auth = Buffer.from(`${DARAJA.consumerKey}:${DARAJA.consumerSecret}`).toString('base64');
    const response = await axios.get(`${DARAJA.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: { Authorization: `Basic ${auth}` }
    });
    return response.data.access_token;
};

// 1. TRIGGER STK PUSH
router.post('/stkpush', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ success: false, message: 'Please login first' });
    
    const { phone, planId, amount } = req.body;
    let validPhone = phone.replace(/\D/g, '');
    if (validPhone.startsWith('0')) validPhone = '254' + validPhone.substring(1);
    if (validPhone.startsWith('+')) validPhone = validPhone.substring(1);

    try {
        const token = await getDarajaToken();
        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
        const password = Buffer.from(`${DARAJA.shortCode}${DARAJA.passkey}${timestamp}`).toString('base64');

        const payload = {
            BusinessShortCode: DARAJA.shortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: parseInt(amount),
            PartyA: validPhone,
            PartyB: DARAJA.shortCode,
            PhoneNumber: validPhone,
            CallBackURL: DARAJA.callbackUrl,
            AccountReference: `VINNIE_${planId.toUpperCase()}`,
            TransactionDesc: `Upgrade to ${planId}`
        };

        const response = await axios.post(`${DARAJA.baseUrl}/mpesa/stkpush/v1/processrequest`, payload, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data.CheckoutRequestID) {
            const user = await User.findByPk(req.user.id);
            user.pendingCheckoutId = response.data.CheckoutRequestID;
            await user.save();
            return res.json({ success: true, message: "M-PESA prompt sent. Please enter your PIN." });
        }
        res.json({ success: false, message: "Failed to trigger M-PESA" });

    } catch (err) {
        console.error("Daraja Error:", err.response ? err.response.data : err.message);
        res.status(500).json({ success: false, message: "Failed to connect to Safaricom." });
    }
});

// 2. M-PESA WEBHOOK HANDLER
router.post('/mpesa/callback', async (req, res) => {
    try {
        // Always respond HTTP 200 immediately to prevent Safaricom retry spam
        const callbackData = req.body.Body.stkCallback;
        if (callbackData.ResultCode !== 0) {
            return res.status(200).json({ success: true });
        }

        const checkoutId = callbackData.CheckoutRequestID;
        const metadata = callbackData.CallbackMetadata.Item;
        
        const amountItem = metadata.find(i => i.Name === 'Amount');
        const receiptItem = metadata.find(i => i.Name === 'MpesaReceiptNumber');
        
        const amount = amountItem ? amountItem.Value : 0;
        const receipt = receiptItem ? receiptItem.Value : 'UNKNOWN';

        const user = await User.findOne({ where: { pendingCheckoutId: checkoutId } });
        if (!user) return res.status(200).json({ success: true });

        let newPlan = 'free';
        let limit = 2;
        let hoursToAdd = 0;

        if (amount == 20) { newPlan = 'startup'; limit = 5; hoursToAdd = 24; }
        else if (amount == 50) { newPlan = 'silver'; limit = 10; hoursToAdd = 24 * 7; }
        else if (amount == 100) { newPlan = 'platinum'; limit = 50; hoursToAdd = 24 * 30; }
        else if (amount == 250) { newPlan = 'gold'; limit = 999; hoursToAdd = 24 * 90; }

        if (hoursToAdd > 0) {
            const expireDate = new Date();
            expireDate.setHours(expireDate.getHours() + hoursToAdd);
            
            user.plan = newPlan;
            user.deployLimit = limit;
            user.planExpiresAt = expireDate;
            user.mpesaReceiptNumber = receipt;
            user.pendingCheckoutId = null;
            await user.save();
        }

        res.status(200).json({ success: true });
    } catch (err) {
        console.error("Webhook Error:", err);
        res.status(200).json({ success: true });
    }
});

module.exports = router;
