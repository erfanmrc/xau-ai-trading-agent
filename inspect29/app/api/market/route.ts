import {NextResponse} from "next/server";
import {getXauUsdQuote} from "@/data/twelve-data";
export async function GET(){
 try{return NextResponse.json({ok:true,quote:await getXauUsdQuote()});}
 catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:"Market data error"},{status:500});}
}