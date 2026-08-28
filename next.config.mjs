/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  devIndicators: {
    position: 'bottom-right',
  },
}

export default nextConfig
