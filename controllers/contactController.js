const { sendAdminContactMessage } = require('../utils/email');

const submitContact = async (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ status: 'error', message: 'All fields are required.' });
    }

    try {
        await sendAdminContactMessage(name, email, message);
        res.status(200).json({ status: 'success', message: 'Your message has been sent successfully. We will get back to you soon!' });
    } catch (error) {
        console.error('[Contact] Error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to send message. Please try again later.' });
    }
};

module.exports = { submitContact };
