/** @type {import('next').NextConfig} */
export default {output:'export',trailingSlash:true,images:{unoptimized:true},basePath:process.env.NEXT_PUBLIC_BASE_PATH||''};
