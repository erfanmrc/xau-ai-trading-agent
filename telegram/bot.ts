export async function sendTelegramMessage(text:string){
 const token=process.env.TELEGRAM_BOT_TOKEN,chatId=process.env.TELEGRAM_CHAT_ID;
 if(!token||!chatId){console.warn("Telegram credentials are not configured");return {sent:false};}
 const r=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:chatId,text})});
 if(!r.ok)throw new Error(`Telegram HTTP ${r.status}`);
 return {sent:true};
}