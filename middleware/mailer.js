const nodemailer=require('nodemailer');
const transporter=nodemailer.createTransport({
    service:'gmail',
    auth:{
        user:process.env.EMAIL_USER,
        pass:process.env.EMAIL_PASS
    }
});
function sendVerificationCode(email,code){
    return transporter.sendMail({
        from:process.env.EMAIL_USER,
        to:email,
        subject:'Prepsphere-Email Verification',
         html: `<h2>Your verification code is: <strong>${code}</strong></h2>
               <p>This code expires in 10 minutes.</p>`
    });
}
module.exports={sendVerificationCode};