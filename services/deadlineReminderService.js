import Order from '../models/Order.js';
import { sendEmail } from './emailService.js';

/**
 * Deadline Reminder Service
 * Runs periodically to check for upcoming deadlines and send reminder emails
 */

// Track sent reminders to avoid duplicates (in production, use Redis or DB)
const sentReminders = new Map();

// Status labels for email
const statusLabels = {
    pending: 'Pending Review',
    quoted: 'Awaiting Your Response',
    accepted: 'Confirmed',
    working: 'In Progress',
    review: 'Under Review',
    delivered: 'Delivered',
    completed: 'Completed',
};

/**
 * Check for assignments with approaching deadlines and send reminders
 */
export const checkDeadlineReminders = async () => {
    try {
        const now = new Date();

        // Find assignments that are active and have deadlines within 3 days
        const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

        const assignments = await Order.find({
            status: { $in: ['accepted', 'working', 'review'] },
            deadline: {
                $gte: now,
                $lte: threeDaysFromNow
            }
        }).populate('client', 'name email');

        console.log(`[Deadline Reminder] Found ${assignments.length} assignments with upcoming deadlines`);

        for (const assignment of assignments) {
            const deadlineDate = new Date(assignment.deadline);
            const hoursRemaining = Math.floor((deadlineDate - now) / (1000 * 60 * 60));
            const daysRemaining = Math.floor(hoursRemaining / 24);

            // Determine reminder type based on time remaining
            let reminderType = null;
            if (hoursRemaining <= 24) {
                reminderType = '24h';
            } else if (daysRemaining <= 2) {
                reminderType = '2d';
            } else if (daysRemaining <= 3) {
                reminderType = '3d';
            }

            if (!reminderType) continue;

            // Create unique key for this reminder
            const reminderKey = `${assignment._id}-${reminderType}`;

            // Skip if already sent
            if (sentReminders.has(reminderKey)) {
                continue;
            }

            // Get client email
            const clientEmail = assignment.client?.email || assignment.clientEmail;
            if (!clientEmail) continue;

            // Calculate time remaining string
            let timeRemaining;
            if (hoursRemaining < 24) {
                timeRemaining = `${hoursRemaining} hours`;
            } else {
                timeRemaining = `${daysRemaining} day${daysRemaining > 1 ? 's' : ''}`;
            }

            try {
                const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
                await sendEmail(clientEmail, 'deadlineReminder', {
                    clientName: assignment.client?.name || assignment.clientName || 'Valued Customer',
                    assignmentTitle: assignment.title,
                    timeRemaining,
                    deadline: deadlineDate.toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    }),
                    status: statusLabels[assignment.status] || assignment.status,
                    progress: assignment.progress || 0,
                    dashboardUrl: `${baseUrl}/dashboard/client/orders/${assignment._id}`,
                });

                // Mark as sent
                sentReminders.set(reminderKey, Date.now());
                console.log(`[Deadline Reminder] Sent ${reminderType} reminder for "${assignment.title}" to ${clientEmail}`);
            } catch (emailError) {
                console.error(`[Deadline Reminder] Failed to send email for ${assignment._id}:`, emailError);
            }
        }

        // Clean up old entries from sentReminders (older than 7 days)
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        for (const [key, timestamp] of sentReminders.entries()) {
            if (timestamp < sevenDaysAgo) {
                sentReminders.delete(key);
            }
        }

    } catch (error) {
        console.error('[Deadline Reminder] Error checking deadlines:', error);
    }
};

/**
 * Start the deadline reminder scheduler
 * Runs every hour to check for upcoming deadlines
 */
export const startDeadlineReminderScheduler = () => {
    // Run immediately on startup
    console.log('[Deadline Reminder] Starting deadline reminder service...');
    checkDeadlineReminders();

    // Then run every hour
    const intervalMs = 60 * 60 * 1000; // 1 hour
    setInterval(checkDeadlineReminders, intervalMs);

    console.log('[Deadline Reminder] Scheduler started - checking every hour');
};

export default {
    checkDeadlineReminders,
    startDeadlineReminderScheduler
};
