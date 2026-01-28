import nodemailer from 'nodemailer';

// Create transporter
const createTransporter = () => {
  // Use environment variables for configuration
  if (process.env.EMAIL_HOST) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  // Fallback: Log emails to console in development
  console.log('Email service not configured - emails will be logged to console');
  return null;
};

let transporter = null;

// Initialize transporter
export const initEmailService = () => {
  transporter = createTransporter();
  if (transporter) {
    console.log('Email service initialized');
  }
};

// Email templates
const templates = {
  contractReady: (data) => ({
    subject: `Contract Ready for Signature - ${data.contractNumber}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
          .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .details-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Contract Ready</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Your contract is ready for review and signature</p>
          </div>
          <div class="content">
            <p>Dear ${data.clientName},</p>
            <p>Your contract for <strong>${data.projectTitle}</strong> is now ready for your review and signature.</p>

            <div class="details">
              <div class="details-row">
                <span>Contract Number:</span>
                <strong>${data.contractNumber}</strong>
              </div>
              <div class="details-row">
                <span>Project:</span>
                <strong>${data.projectTitle}</strong>
              </div>
              <div class="details-row">
                <span>Total Amount:</span>
                <strong>${data.currency} ${data.totalAmount?.toLocaleString()}</strong>
              </div>
            </div>

            <p>Please review the contract carefully and sign it to proceed with your project.</p>

            <center>
              <a href="${data.contractUrl}" class="button">Review & Sign Contract</a>
            </center>

            <p style="color: #6b7280; font-size: 14px;">If you have any questions, please don't hesitate to contact us.</p>
          </div>
          <div class="footer">
            <p>CodeSupport - Professional Development Services</p>
            <p style="font-size: 12px;">This is an automated message. Please do not reply directly to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  contractSigned: (data) => ({
    subject: `Contract Signed - ${data.contractNumber}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
          .button { display: inline-block; background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
          .success-icon { font-size: 48px; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="success-icon">✓</div>
            <h1 style="margin: 0;">Contract Signed Successfully</h1>
          </div>
          <div class="content">
            <p>Dear ${data.clientName},</p>
            <p>Thank you for signing the contract for <strong>${data.projectTitle}</strong>.</p>
            <p>Your contract is now active and our team will begin working on your project shortly.</p>

            <h3>What's Next?</h3>
            <ul>
              <li>Our team will review the project requirements</li>
              <li>You'll receive updates on project progress</li>
              <li>Payment milestones will be invoiced as per the contract</li>
            </ul>

            <center>
              <a href="${data.contractUrl}" class="button">View Contract</a>
            </center>
          </div>
          <div class="footer">
            <p>CodeSupport - Professional Development Services</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  invoiceGenerated: (data) => ({
    subject: `Invoice ${data.invoiceNumber} - Payment Required`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
          .amount-box { background: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; border: 2px solid #f59e0b; }
          .amount { font-size: 32px; font-weight: bold; color: #d97706; }
          .button { display: inline-block; background: #f59e0b; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Invoice Generated</h1>
            <p style="margin: 10px 0 0 0;">${data.invoiceNumber}</p>
          </div>
          <div class="content">
            <p>Dear ${data.clientName},</p>
            <p>An invoice has been generated for <strong>${data.description}</strong>.</p>

            <div class="amount-box">
              <p style="margin: 0; color: #6b7280;">Amount Due</p>
              <p class="amount">${data.currency} ${data.amount?.toLocaleString()}</p>
              <p style="margin: 0; color: #6b7280;">Due: ${data.dueDate}</p>
            </div>

            <center>
              <a href="${data.paymentUrl}" class="button">Pay Now</a>
            </center>

            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
              Please make the payment before the due date to avoid any delays in your project.
            </p>
          </div>
          <div class="footer">
            <p>CodeSupport - Professional Development Services</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  paymentReceived: (data) => ({
    subject: `Payment Received - Thank You!`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Payment Received</h1>
          </div>
          <div class="content">
            <p>Dear ${data.clientName},</p>
            <p>We have received your payment of <strong>${data.currency} ${data.amount?.toLocaleString()}</strong>.</p>
            <p>Thank you for your prompt payment. Your project will continue as scheduled.</p>

            <p>Transaction Details:</p>
            <ul>
              <li>Amount: ${data.currency} ${data.amount?.toLocaleString()}</li>
              <li>Invoice: ${data.invoiceNumber}</li>
              <li>Date: ${data.paymentDate}</li>
            </ul>
          </div>
          <div class="footer">
            <p>CodeSupport - Professional Development Services</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  orderStatusUpdate: (data) => ({
    subject: `Project Update - ${data.projectTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
          .status-badge { display: inline-block; background: #10b981; color: white; padding: 8px 16px; border-radius: 20px; font-weight: 600; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Project Update</h1>
          </div>
          <div class="content">
            <p>Dear ${data.clientName},</p>
            <p>There's an update on your project <strong>${data.projectTitle}</strong>.</p>

            <p>New Status: <span class="status-badge">${data.status}</span></p>

            ${data.message ? `<p>${data.message}</p>` : ''}

            <center>
              <a href="${data.dashboardUrl}" class="button">View Project</a>
            </center>
          </div>
          <div class="footer">
            <p>CodeSupport - Professional Development Services</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  // ============================================
  // ACADEMIC ASSIGNMENT TEMPLATES
  // ============================================

  quoteReady: (data) => ({
    subject: `Quote Ready - ${data.assignmentTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
          .price-box { background: white; padding: 24px; border-radius: 12px; text-align: center; margin: 24px 0; border: 2px solid #3b82f6; }
          .price { font-size: 36px; font-weight: bold; color: #3b82f6; }
          .button { display: inline-block; background: #10b981; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 8px; }
          .button-secondary { background: #6b7280; }
          .details { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; }
          .details-row { padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Quote Ready!</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Your assignment has been reviewed</p>
          </div>
          <div class="content">
            <p>Dear ${data.clientName},</p>
            <p>Great news! We've reviewed your assignment "<strong>${data.assignmentTitle}</strong>" and prepared a quote for you.</p>

            <div class="price-box">
              <p style="margin: 0 0 8px 0; color: #6b7280;">Total Price</p>
              <p class="price">Rs. ${data.quotedAmount?.toLocaleString()}</p>
            </div>

            <div class="details">
              <div class="details-row"><strong>Assignment:</strong> ${data.assignmentTitle}</div>
              <div class="details-row"><strong>Type:</strong> ${data.assignmentType}</div>
              <div class="details-row"><strong>Deadline:</strong> ${data.deadline}</div>
              ${data.wordCount ? `<div class="details-row"><strong>Word Count:</strong> ${data.wordCount}</div>` : ''}
            </div>

            <p>Review the details and accept to get started. We'll begin working on your assignment immediately upon acceptance.</p>

            <center>
              <a href="${data.acceptUrl}" class="button">Accept Quote</a>
              <a href="${data.viewUrl}" class="button button-secondary">View Details</a>
            </center>

            <p style="color: #6b7280; font-size: 14px; margin-top: 24px; text-align: center;">
              Questions? Reply to this email or chat with us on WhatsApp.
            </p>
          </div>
          <div class="footer">
            <p>CodeSupport - Academic Assignment Assistance</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  assignmentAccepted: (data) => ({
    subject: `Assignment Confirmed - ${data.assignmentTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
          .success-icon { font-size: 48px; margin-bottom: 10px; }
          .timeline { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .timeline-item { padding: 12px 0; border-left: 3px solid #10b981; padding-left: 16px; margin-left: 8px; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="success-icon">✓</div>
            <h1 style="margin: 0;">Assignment Confirmed!</h1>
          </div>
          <div class="content">
            <p>Dear ${data.clientName},</p>
            <p>Thank you! Your assignment "<strong>${data.assignmentTitle}</strong>" is now confirmed and our team is getting started.</p>

            <div class="timeline">
              <h3 style="margin-top: 0;">What happens next:</h3>
              <div class="timeline-item">
                <strong>Now:</strong> Our experts begin working on your assignment
              </div>
              <div class="timeline-item">
                <strong>During:</strong> You can track progress in your dashboard
              </div>
              <div class="timeline-item">
                <strong>Before deadline:</strong> We'll deliver your completed assignment
              </div>
            </div>

            <p><strong>Deadline:</strong> ${data.deadline}</p>
            <p><strong>Amount:</strong> Rs. ${data.quotedAmount?.toLocaleString()}</p>

            <center>
              <a href="${data.dashboardUrl}" class="button">Track Progress</a>
            </center>
          </div>
          <div class="footer">
            <p>CodeSupport - Academic Assignment Assistance</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  assignmentDelivered: (data) => ({
    subject: `Assignment Delivered! - ${data.assignmentTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
          .celebration { font-size: 48px; margin-bottom: 10px; }
          .button { display: inline-block; background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; }
          .revision-note { background: #fef3c7; border: 1px solid #f59e0b; padding: 16px; border-radius: 8px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="celebration">🎉</div>
            <h1 style="margin: 0;">Assignment Delivered!</h1>
          </div>
          <div class="content">
            <p>Dear ${data.clientName},</p>
            <p>Great news! Your assignment "<strong>${data.assignmentTitle}</strong>" has been completed and is ready for download.</p>

            <center>
              <a href="${data.downloadUrl}" class="button">Download Now</a>
            </center>

            <div class="revision-note">
              <strong>Need changes?</strong> You have ${data.revisionsRemaining} free revision(s) remaining. Request a revision within 7 days if needed.
            </div>

            <p>Please review the delivered work carefully. If everything looks good, you can mark it as complete in your dashboard.</p>

            <p style="color: #6b7280; font-size: 14px;">
              Thank you for choosing CodeSupport. We hope you're satisfied with our work!
            </p>
          </div>
          <div class="footer">
            <p>CodeSupport - Academic Assignment Assistance</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  revisionConfirmation: (data) => ({
    subject: `Revision Request Received - ${data.assignmentTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
          .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #8b5cf6; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Revision Request Received</h1>
          </div>
          <div class="content">
            <p>Dear ${data.clientName},</p>
            <p>We've received your revision request for "<strong>${data.assignmentTitle}</strong>".</p>

            <div class="info-box">
              <p style="margin: 0;"><strong>Revision #${data.revisionNumber}</strong></p>
              <p style="margin: 8px 0 0 0; color: #6b7280;">Revisions remaining: ${data.revisionsRemaining}</p>
            </div>

            <p>Our team has been notified and will start working on your requested changes. You'll receive an email when the revised version is ready.</p>

            <center>
              <a href="${data.dashboardUrl}" class="button">Track Progress</a>
            </center>

            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
              Thank you for your feedback. We're committed to delivering work that meets your expectations.
            </p>
          </div>
          <div class="footer">
            <p>CodeSupport - Academic Assignment Assistance</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  paymentVerified: (data) => ({
    subject: `✓ Payment Confirmed - ${data.assignmentTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
          .success-icon { font-size: 48px; margin-bottom: 10px; }
          .amount-box { background: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; border: 2px solid #10b981; }
          .amount { font-size: 28px; font-weight: bold; color: #10b981; }
          .next-steps { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .step { padding: 10px 0; border-bottom: 1px solid #f3f4f6; display: flex; align-items: center; }
          .step:last-child { border-bottom: none; }
          .step-number { width: 28px; height: 28px; background: #10b981; color: white; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-right: 12px; font-weight: bold; font-size: 14px; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="success-icon">✓</div>
            <h1 style="margin: 0;">Payment Confirmed!</h1>
          </div>
          <div class="content">
            <p>Dear ${data.clientName},</p>
            <p>Great news! Your payment for "<strong>${data.assignmentTitle}</strong>" has been verified and confirmed.</p>

            <div class="amount-box">
              <p style="margin: 0 0 8px 0; color: #6b7280;">Amount Paid</p>
              <p class="amount">Rs. ${data.amount?.toLocaleString()}</p>
              <p style="margin: 8px 0 0 0; color: #6b7280;">Verified on ${data.verifiedDate}</p>
            </div>

            <div class="next-steps">
              <h3 style="margin-top: 0;">What happens next:</h3>
              <div class="step">
                <span class="step-number">1</span>
                <span>Our team will start working on your assignment</span>
              </div>
              <div class="step">
                <span class="step-number">2</span>
                <span>You can track progress in your dashboard</span>
              </div>
              <div class="step">
                <span class="step-number">3</span>
                <span>We'll deliver before your deadline</span>
              </div>
            </div>

            <center>
              <a href="${data.dashboardUrl}" class="button">Track Your Assignment</a>
            </center>

            <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
              Thank you for choosing CodeSupport!
            </p>
          </div>
          <div class="footer">
            <p>CodeSupport - Academic Assignment Assistance</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  deadlineReminder: (data) => ({
    subject: `⏰ Deadline Approaching - ${data.assignmentTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
          .countdown { background: white; padding: 24px; border-radius: 12px; text-align: center; margin: 24px 0; border: 2px solid #f59e0b; }
          .time-left { font-size: 32px; font-weight: bold; color: #ea580c; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">⏰ Deadline Reminder</h1>
          </div>
          <div class="content">
            <p>Dear ${data.clientName},</p>
            <p>This is a friendly reminder about your assignment "<strong>${data.assignmentTitle}</strong>".</p>

            <div class="countdown">
              <p style="margin: 0 0 8px 0; color: #6b7280;">Time Remaining</p>
              <p class="time-left">${data.timeRemaining}</p>
              <p style="margin: 8px 0 0 0; color: #6b7280;">Deadline: ${data.deadline}</p>
            </div>

            <p><strong>Current Status:</strong> ${data.status}</p>
            <p><strong>Progress:</strong> ${data.progress}%</p>

            <p>Our team is working on your assignment. You'll receive a notification as soon as it's ready for delivery.</p>

            <center>
              <a href="${data.dashboardUrl}" class="button">View Progress</a>
            </center>
          </div>
          <div class="footer">
            <p>CodeSupport - Academic Assignment Assistance</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  // ============================================
  // SECURITY TEMPLATES
  // ============================================

  otpVerification: (data) => ({
    subject: `Your Verification Code - ${data.code}`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #3b82f6;">Verification Code</h2>
          <p>Use the following code to complete your login or verification:</p>
          <div style="background: #f3f4f6; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; border-radius: 8px; margin: 20px 0;">
            ${data.code}
          </div>
          <p>This code will expire in 10 minutes.</p>
          <p style="color: #6b7280; font-size: 14px;">If you didn't request this, please change your password immediately.</p>
        </div>
      </body>
      </html>
    `,
  }),

  emailVerification: (data) => ({
    subject: `Verify Your Email Address`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #10b981;">Welcome to ProjectHub!</h2>
          <p>Please click the button below to verify your email address and activate your account:</p>
          <center>
            <a href="${data.verifyUrl}" style="display: inline-block; background: #10b981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0;">Verify Email</a>
          </center>
          <p style="color: #6b7280; font-size: 14px;">Link expires in 24 hours.</p>
        </div>
      </body>
      </html>
    `,
  }),

  passwordReset: (data) => ({
    subject: `Reset Your Password`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #ef4444;">Password Reset Request</h2>
          <p>We received a request to reset your password. Click the button below to create a new password:</p>
          <center>
            <a href="${data.resetUrl}" style="display: inline-block; background: #ef4444; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0;">Reset Password</a>
          </center>
          <p style="color: #6b7280; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      </body>
      </html>
    `,
  }),

  loginAlert: (data) => ({
    subject: `New Login Detected - ${data.location}`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #f59e0b;">New Login Alert</h2>
          <p>We detected a new login to your account.</p>
          <ul style="background: #fffbeb; padding: 15px 30px; border-radius: 8px; border: 1px solid #fcd34d;">
            <li><strong>Time:</strong> ${data.time}</li>
            <li><strong>Location:</strong> ${data.location}</li>
            <li><strong>IP Address:</strong> ${data.ip}</li>
            <li><strong>Device:</strong> ${data.device}</li>
          </ul>
          <p>If this was you, you can ignore this email. If not, please <strong>change your password immediately</strong>.</p>
        </div>
      </body>
      </html>
    `,
  }),
};

// Send email function
export const sendEmail = async (to, templateName, data) => {
  const template = templates[templateName];
  if (!template) {
    console.error(`Email template "${templateName}" not found`);
    return false;
  }

  const { subject, html } = template(data);

  // If no transporter (development mode), log to console
  if (!transporter) {
    console.log('=== EMAIL (Development Mode) ===');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('Template:', templateName);
    console.log('Data:', JSON.stringify(data, null, 2));
    console.log('================================');
    return true;
  }

  try {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'CodeSupport'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent:', result.messageId);
    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
};

// Send email to multiple recipients
export const sendBulkEmail = async (recipients, templateName, dataGenerator) => {
  const results = await Promise.allSettled(
    recipients.map(recipient =>
      sendEmail(recipient.email, templateName, dataGenerator(recipient))
    )
  );

  return results.map((result, index) => ({
    email: recipients[index].email,
    success: result.status === 'fulfilled' && result.value,
  }));
};

export default {
  initEmailService,
  sendEmail,
  sendBulkEmail,
};
