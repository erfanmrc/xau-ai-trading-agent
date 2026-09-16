import React from "react";
export const metadata={title:"XAU AI Trading Agent",description:"XAUUSD cloud trading analysis agent"};
export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="en"><body style={{margin:0,fontFamily:"Arial",background:"#0b1020",color:"#fff"}}>{children}</body></html>;
}