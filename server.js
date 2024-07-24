const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/shopBot', { useNewUrlParser: true, useUnifiedTopology: true });

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true
}));

// Log request paths for debugging
app.use((req, res, next) => {
    console.log(`Request Path: ${req.path}, Method: ${req.method}`);
    next();
});

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Schema and Model
const strainSchema = new mongoose.Schema({
    name: String,
    price: Number,
    grams_available: Number
}, { collection: 'Strains' });

const gramSchema = new mongoose.Schema({
    user_id: mongoose.Schema.Types.Number,
    username: String,
    item_name: String,
    item_price: Number,
    quantity: Number,
    time_slot: String,
    pickup_date: String,
    timestamp: Date
}, { collection: 'Grams' });

const orderSchema = new mongoose.Schema({
    username: String,
    item_name: String,
    quantity: Number,
    amount_paid: Number,
    confirmation_date: Date
}, { collection: 'Orders' });

const Strain = mongoose.model('Strain', strainSchema);
const Gram = mongoose.model('Gram', gramSchema);
const Order = mongoose.model('Order', orderSchema);

// Hardcoded admin credentials
const adminUsername = 'admin';
const adminPassword = 'password';

// Middleware to check if the user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Login routes
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === adminUsername && password === adminPassword) {
        req.session.user = username;
        res.redirect('/');
    } else {
        res.send('Invalid credentials');
    }
});

app.get('/members', isAuthenticated, (req, res) => {
    res.render('members');
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Route to view strains and grams
app.get('/', isAuthenticated, async (req, res) => {
    try {
        const strains = await Strain.find();
        const grams = await Gram.find();
        res.render('index', { strains, grams });
    } catch (err) {
        console.error('Error fetching data:', err); // Log detailed error message
        res.status(500).send('Error fetching data');
    }
});

// Route to delete a gram entry and update strain grams available
app.post('/grams/:id/delete', isAuthenticated, async (req, res) => {
    try {
        const gram = await Gram.findById(req.params.id);
        if (gram) {
            const strain = await Strain.findOne({ name: gram.item_name });
            if (strain) {
                strain.grams_available += gram.quantity;
                await strain.save();
            }
            await Gram.findByIdAndDelete(req.params.id);
        }
        res.redirect('/');
    } catch (err) {
        console.error('Error deleting entry:', err);
        res.status(500).send('Error deleting entry');
    }
});

// Route to confirm an order
app.post('/grams/:id/confirm', isAuthenticated, async (req, res) => {
    try {
        const gram = await Gram.findById(req.params.id);
        if (!gram) {
            return res.status(404).send('Gram not found');
        }

        const newOrder = new Order({
            username: gram.username,
            item_name: gram.item_name,
            quantity: gram.quantity,
            amount_paid: gram.quantity * 8,
            confirmation_date: new Date()
        });

        await newOrder.save();
        await Gram.findByIdAndDelete(req.params.id);

        res.redirect('/');
    } catch (error) {
        console.error('Error confirming order:', error);
        res.status(500).send('Internal server error');
    }
});

// Route to view orders and perform calculations
app.get('/orders', isAuthenticated, async (req, res) => {
    try {
        const orders = await Order.find();
        
        // Calculate total quantity for each item name
        const totalQuantitiesByItem = orders.reduce((acc, order) => {
            const existingItem = acc.find(item => item.item_name === order.item_name);
            if (existingItem) {
                existingItem.totalQuantity += order.quantity;
            } else {
                acc.push({ item_name: order.item_name, totalQuantity: order.quantity });
            }
            return acc;
        }, []);

        // Calculate total quantity of all entries
        const totalQuantity = orders.reduce((sum, order) => sum + order.quantity, 0);

        // Calculate total amount paid for all orders
        const totalAmountPaid = orders.reduce((sum, order) => sum + order.amount_paid, 0);

        // Calculate total quantity and amount paid for the current month
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const totalQuantityCurrentMonth = orders
            .filter(order => {
                const orderDate = new Date(order.confirmation_date);
                return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
            })
            .reduce((sum, order) => sum + order.quantity, 0);

        const totalAmountPaidCurrentMonth = orders
            .filter(order => {
                const orderDate = new Date(order.confirmation_date);
                return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
            })
            .reduce((sum, order) => sum + order.amount_paid, 0);

        res.render('orders', {
            orders,
            totalQuantitiesByItem,
            totalQuantity,
            totalQuantityCurrentMonth,
            totalAmountPaid,
            totalAmountPaidCurrentMonth
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).send('Internal server error');
    }
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
