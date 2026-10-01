/** True in the hosted showcase build (NEXT_PUBLIC_SHOWCASE=1), inlined at build time. */
export const isShowcase = () => process.env.NEXT_PUBLIC_SHOWCASE === "1";
