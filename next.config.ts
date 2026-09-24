// @req SCD-DEP-002 — deployed on Vercel (Preview per PR, Production from main); NEXT_PUBLIC_API_URL set per environment.
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
};

export default nextConfig;
