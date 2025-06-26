const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// Email templates
const emailTemplates = {
  welcome: (data) => ({
    subject: 'Welcome to English School ERP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Welcome to English School ERP!</h2>
        <p>Hello ${data.name},</p>
        <p>Welcome to our English School ERP system! Your account has been successfully created.</p>
        <p><strong>Role:</strong> ${data.role}</p>
        <p>You can now log in to your account and start using our platform.</p>
        <p>If you have any questions, please don't hesitate to contact us.</p>
        <p>Best regards,<br>The English School Team</p>
      </div>
    `
  }),

  passwordReset: (data) => ({
    subject: 'Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Password Reset Request</h2>
        <p>Hello ${data.name},</p>
        <p>We received a request to reset your password. Click the link below to reset it:</p>
        <p><a href="${data.resetLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Reset Password</a></p>
        <p>If you didn't request this, please ignore this email.</p>
        <p>This link will expire in 1 hour.</p>
        <p>Best regards,<br>The English School Team</p>
      </div>
    `
  }),

  passwordResetConfirmed: (data) => ({
    subject: 'Password Reset Confirmed',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #059669;">Password Reset Confirmed</h2>
        <p>Hello ${data.name},</p>
        <p>Your password has been successfully reset.</p>
        <p>If you didn't make this change, please contact us immediately.</p>
        <p>Best regards,<br>The English School Team</p>
      </div>
    `
  }),

  passwordChanged: (data) => ({
    subject: 'Password Changed',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #059669;">Password Changed Successfully</h2>
        <p>Hello ${data.name},</p>
        <p>Your password has been changed successfully.</p>
        <p>If you didn't make this change, please contact us immediately.</p>
        <p>Best regards,<br>The English School Team</p>
      </div>
    `
  }),

  courseEnrollment: (data) => ({
    subject: 'Course Enrollment Confirmation',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Course Enrollment Confirmed</h2>
        <p>Hello ${data.studentName},</p>
        <p>Your enrollment in <strong>${data.courseName}</strong> has been confirmed.</p>
        <p><strong>Course Details:</strong></p>
        <ul>
          <li>Level: ${data.level}</li>
          <li>Start Date: ${data.startDate}</li>
          <li>End Date: ${data.endDate}</li>
          <li>Teacher: ${data.teacherName}</li>
          <li>Total Amount: $${data.amount}</li>
        </ul>
        <p>We look forward to seeing you in class!</p>
        <p>Best regards,<br>The English School Team</p>
      </div>
    `
  }),

  paymentReceived: (data) => ({
    subject: 'Payment Received',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #059669;">Payment Received</h2>
        <p>Hello ${data.studentName},</p>
        <p>We have received your payment of <strong>$${data.amount}</strong> for <strong>${data.courseName}</strong>.</p>
        <p><strong>Payment Details:</strong></p>
        <ul>
          <li>Receipt Number: ${data.receiptNumber}</li>
          <li>Payment Method: ${data.paymentMethod}</li>
          <li>Date: ${data.paymentDate}</li>
        </ul>
        <p>Thank you for your payment!</p>
        <p>Best regards,<br>The English School Team</p>
      </div>
    `
  }),

  paymentReminder: (data) => ({
    subject: 'Payment Reminder',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Payment Reminder</h2>
        <p>Hello ${data.studentName},</p>
        <p>This is a reminder that your payment of <strong>$${data.amount}</strong> for <strong>${data.courseName}</strong> is due on ${data.dueDate}.</p>
        <p>Please make your payment to avoid any interruptions to your course.</p>
        <p>Best regards,<br>The English School Team</p>
      </div>
    `
  }),

  gradePosted: (data) => ({
    subject: 'New Grade Posted',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">New Grade Posted</h2>
        <p>Hello ${data.studentName},</p>
        <p>A new grade has been posted for <strong>${data.courseName}</strong>.</p>
        <p><strong>Grade Details:</strong></p>
        <ul>
          <li>Assessment: ${data.assessmentTitle}</li>
          <li>Score: ${data.score}/${data.maxScore}</li>
          <li>Percentage: ${data.percentage}%</li>
          <li>Grade: ${data.gradeLetter}</li>
        </ul>
        <p>Keep up the great work!</p>
        <p>Best regards,<br>The English School Team</p>
      </div>
    `
  }),

  courseStart: (data) => ({
    subject: 'Course Starting Soon',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Course Starting Soon</h2>
        <p>Hello ${data.studentName},</p>
        <p>Your course <strong>${data.courseName}</strong> is starting on ${data.startDate}.</p>
        <p><strong>Course Details:</strong></p>
        <ul>
          <li>Level: ${data.level}</li>
          <li>Teacher: ${data.teacherName}</li>
          <li>Schedule: ${data.schedule}</li>
          <li>Classroom: ${data.classroom}</li>
        </ul>
        <p>We're excited to see you in class!</p>
        <p>Best regards,<br>The English School Team</p>
      </div>
    `
  }),

  attendanceAlert: (data) => ({
    subject: 'Attendance Alert',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Attendance Alert</h2>
        <p>Hello ${data.studentName},</p>
        <p>We noticed that your attendance in <strong>${data.courseName}</strong> has dropped below ${data.threshold}%.</p>
        <p>Current attendance: ${data.currentAttendance}%</p>
        <p>Regular attendance is important for your learning progress. Please make sure to attend all classes.</p>
        <p>If you have any concerns, please contact your teacher.</p>
        <p>Best regards,<br>The English School Team</p>
      </div>
    `
  })
};

// Send email function
const sendEmail = async ({ to, subject, html, template, data, attachments = [] }) => {
  try {
    // Check if email configuration is available
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn('Email configuration not found. Skipping email send.');
      return { success: false, message: 'Email configuration not available' };
    }

    const transporter = createTransporter();

    // Use template if provided
    let emailSubject = subject;
    let emailHtml = html;

    if (template && emailTemplates[template]) {
      const templateData = emailTemplates[template](data);
      emailSubject = templateData.subject;
      emailHtml = templateData.html;
    }

    const mailOptions = {
      from: `"English School ERP" <${process.env.SMTP_USER}>`,
      to,
      subject: emailSubject,
      html: emailHtml,
      attachments
    };

    const result = await transporter.sendMail(mailOptions);
    
    console.log('Email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Email sending error:', error);
    return { success: false, error: error.message };
  }
};

// Send bulk emails
const sendBulkEmail = async (recipients, options) => {
  const results = [];
  
  for (const recipient of recipients) {
    const result = await sendEmail({
      ...options,
      to: recipient.email
    });
    results.push({ recipient, result });
  }
  
  return results;
};

// Send notification email
const sendNotificationEmail = async (notification) => {
  const { recipient, type, title, message, metadata } = notification;
  
  let template = null;
  let data = { name: recipient.getFullName() };
  
  // Map notification types to email templates
  switch (type) {
    case 'course_start':
      template = 'courseStart';
      data = { ...data, ...metadata };
      break;
    case 'payment_received':
      template = 'paymentReceived';
      data = { ...data, ...metadata };
      break;
    case 'payment_due':
      template = 'paymentReminder';
      data = { ...data, ...metadata };
      break;
    case 'grade_posted':
      template = 'gradePosted';
      data = { ...data, ...metadata };
      break;
    case 'attendance_alert':
      template = 'attendanceAlert';
      data = { ...data, ...metadata };
      break;
    case 'enrollment_confirmed':
      template = 'courseEnrollment';
      data = { ...data, ...metadata };
      break;
    default:
      // Send generic notification
      return await sendEmail({
        to: recipient.email,
        subject: title,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">${title}</h2>
            <p>Hello ${recipient.getFullName()},</p>
            <p>${message}</p>
            <p>Best regards,<br>The English School Team</p>
          </div>
        `
      });
  }
  
  return await sendEmail({
    to: recipient.email,
    template,
    data
  });
};

module.exports = {
  sendEmail,
  sendBulkEmail,
  sendNotificationEmail,
  emailTemplates
}; 