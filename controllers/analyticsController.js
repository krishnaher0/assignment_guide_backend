import Order from '../models/Order.js';
import User from '../models/User.js';
import Contract from '../models/Contract.js';
import Invoice from '../models/Invoice.js';
import Quote from '../models/Quote.js';

// @desc    Get dashboard analytics
// @route   GET /api/analytics/dashboard
// @access  Private/Admin
export const getDashboardAnalytics = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        // Get counts
        const [
            totalOrders,
            totalClients,
            totalDevelopers,
            totalContracts,
            activeContracts,
            totalInvoices,
            paidInvoices,
        ] = await Promise.all([
            Order.countDocuments(),
            User.countDocuments({ role: 'client' }),
            User.countDocuments({ role: 'developer' }),
            Contract.countDocuments(),
            Contract.countDocuments({ status: 'active' }),
            Invoice.countDocuments(),
            Invoice.countDocuments({ status: 'paid' }),
        ]);

        // Revenue calculations
        const revenueAgg = await Invoice.aggregate([
            { $match: { status: 'paid' } },
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]);
        const totalRevenue = revenueAgg[0]?.total || 0;

        // This month's revenue
        const thisMonthRevenue = await Invoice.aggregate([
            { $match: { status: 'paid', paidAt: { $gte: startOfMonth } } },
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]);

        // Last month's revenue
        const lastMonthRevenue = await Invoice.aggregate([
            { $match: { status: 'paid', paidAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]);

        // Orders by status
        const ordersByStatus = await Order.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        // Revenue by month (last 12 months)
        const revenueByMonth = await Invoice.aggregate([
            {
                $match: {
                    status: 'paid',
                    paidAt: { $gte: new Date(now.getFullYear() - 1, now.getMonth(), 1) }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$paidAt' },
                        month: { $month: '$paidAt' }
                    },
                    revenue: { $sum: '$total' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // Format revenue by month
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const formattedRevenueByMonth = revenueByMonth.map(item => ({
            month: `${monthNames[item._id.month - 1]} ${item._id.year}`,
            revenue: item.revenue,
            count: item.count
        }));

        // Orders by month (last 12 months)
        const ordersByMonth = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: new Date(now.getFullYear() - 1, now.getMonth(), 1) }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        const formattedOrdersByMonth = ordersByMonth.map(item => ({
            month: `${monthNames[item._id.month - 1]} ${item._id.year}`,
            orders: item.count
        }));

        // Recent orders
        const recentOrders = await Order.find()
            .populate('client', 'name email')
            .sort({ createdAt: -1 })
            .limit(5);

        // Pending invoices
        const pendingInvoices = await Invoice.find({
            status: { $in: ['sent', 'viewed', 'overdue'] }
        })
            .populate('client', 'name')
            .sort({ dueDate: 1 })
            .limit(5);

        // Quote conversion rate
        const totalQuotes = await Quote.countDocuments();
        const acceptedQuotes = await Quote.countDocuments({ status: 'accepted' });
        const conversionRate = totalQuotes > 0 ? ((acceptedQuotes / totalQuotes) * 100).toFixed(1) : 0;

        res.json({
            summary: {
                totalRevenue,
                thisMonthRevenue: thisMonthRevenue[0]?.total || 0,
                lastMonthRevenue: lastMonthRevenue[0]?.total || 0,
                revenueGrowth: lastMonthRevenue[0]?.total
                    ? (((thisMonthRevenue[0]?.total || 0) - lastMonthRevenue[0].total) / lastMonthRevenue[0].total * 100).toFixed(1)
                    : 0,
                totalOrders,
                totalClients,
                totalDevelopers,
                totalContracts,
                activeContracts,
                totalInvoices,
                paidInvoices,
                conversionRate,
            },
            charts: {
                revenueByMonth: formattedRevenueByMonth,
                ordersByMonth: formattedOrdersByMonth,
                ordersByStatus: ordersByStatus.reduce((acc, item) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {}),
            },
            recentOrders,
            pendingInvoices,
        });
    } catch (error) {
        console.error('Dashboard Analytics Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get revenue analytics
// @route   GET /api/analytics/revenue
// @access  Private/Admin
export const getRevenueAnalytics = async (req, res) => {
    try {
        const { startDate, endDate, groupBy = 'month' } = req.query;

        const matchStage = { status: 'paid' };
        if (startDate) matchStage.paidAt = { $gte: new Date(startDate) };
        if (endDate) matchStage.paidAt = { ...matchStage.paidAt, $lte: new Date(endDate) };

        let groupStage;
        if (groupBy === 'day') {
            groupStage = {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } }
            };
        } else if (groupBy === 'week') {
            groupStage = {
                _id: { $dateToString: { format: '%Y-W%V', date: '$paidAt' } }
            };
        } else {
            groupStage = {
                _id: { $dateToString: { format: '%Y-%m', date: '$paidAt' } }
            };
        }

        const revenue = await Invoice.aggregate([
            { $match: matchStage },
            {
                $group: {
                    ...groupStage,
                    revenue: { $sum: '$total' },
                    count: { $sum: 1 },
                    avgInvoice: { $avg: '$total' }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const total = revenue.reduce((sum, item) => sum + item.revenue, 0);
        const avgPerPeriod = revenue.length > 0 ? total / revenue.length : 0;

        res.json({
            data: revenue,
            summary: {
                total,
                periods: revenue.length,
                avgPerPeriod,
                totalInvoices: revenue.reduce((sum, item) => sum + item.count, 0),
            }
        });
    } catch (error) {
        console.error('Revenue Analytics Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get client analytics
// @route   GET /api/analytics/clients
// @access  Private/Admin
export const getClientAnalytics = async (req, res) => {
    try {
        // Top clients by revenue
        const topClients = await Invoice.aggregate([
            { $match: { status: 'paid' } },
            {
                $group: {
                    _id: '$client',
                    totalSpent: { $sum: '$total' },
                    invoiceCount: { $sum: 1 }
                }
            },
            { $sort: { totalSpent: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'client'
                }
            },
            { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    name: '$client.name',
                    email: '$client.email',
                    totalSpent: 1,
                    invoiceCount: 1
                }
            }
        ]);

        // Client acquisition by month
        const clientsByMonth = await User.aggregate([
            { $match: { role: 'client' } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } },
            { $limit: 12 }
        ]);

        res.json({
            topClients,
            clientsByMonth,
        });
    } catch (error) {
        console.error('Client Analytics Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get project analytics
// @route   GET /api/analytics/projects
// @access  Private/Admin
export const getProjectAnalytics = async (req, res) => {
    try {
        // Projects by status
        const projectsByStatus = await Order.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        // Average project value
        const avgProjectValue = await Quote.aggregate([
            { $match: { status: 'accepted' } },
            { $group: { _id: null, avg: { $avg: '$total' } } }
        ]);

        // Project completion rate
        const completedOrders = await Order.countDocuments({ status: 'completed' });
        const totalOrders = await Order.countDocuments({ status: { $ne: 'submitted' } });
        const completionRate = totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(1) : 0;

        res.json({
            projectsByStatus: projectsByStatus.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {}),
            avgProjectValue: avgProjectValue[0]?.avg || 0,
            completionRate,
            totalProjects: totalOrders,
            completedProjects: completedOrders,
        });
    } catch (error) {
        console.error('Project Analytics Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
