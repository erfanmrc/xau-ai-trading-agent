import {NextResponse} from "next/server";
import {buildDecision} from "@/engine/decision";
import {sendTelegramMessage} from "@/telegram/bot";
export async function GET(req:Request){
 const secret=process.env.CRON_SECRET, auth=req.headers.get("authorization");
 if(secret && auth!==`Bearer ${secret}`) return NextResponse.json({ok:false,error:"Unauthorized"},{status:401});
 const decision=await buildDecision();
 if(decision.message) await sendTelegramMessage(decision.message);
 return NextResponse.json({ok:true,decision});
}