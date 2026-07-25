import "@/styles/globals.css";
import "@/styles/sc.css";
import "../../design-system/fishtongue/tokens.css";
import "@/styles/fishtongue-desktop.css";
import type { AppProps } from "next/app";
import Head from "next/head";

export default function FishTongueApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
