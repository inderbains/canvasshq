import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'RealVolt Social Studio',description:'Your brand, your content, your next connection.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
