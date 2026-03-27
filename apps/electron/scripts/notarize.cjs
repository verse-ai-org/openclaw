#!/usr/bin/env node
/**
 * macOS 公证脚本（afterSign hook）
 * electron-builder 签名完成后自动调用此脚本
 *
 * 所需环境变量（在 CI 或本地导出）：
 *   APP_STORE_CONNECT_ISSUER_ID  - App Store Connect API Issuer ID
 *   APP_STORE_CONNECT_KEY_ID     - App Store Connect API Key ID
 *   APP_STORE_CONNECT_API_KEY_P8 - .p8 文件的完整文本内容（含 BEGIN/END 行）
 *
 * 本地快速测试时（LOCAL_FAST=1）跳过公证，不需要设置这些变量。
 */

const path = require('path');

exports.default = async function notarize(context) {
  const { electronPlatformName, appOutDir } = context;

  // 非 macOS 平台直接跳过
  if (electronPlatformName !== 'darwin') return;

  // identity=null 时（LOCAL_FAST 模式）跳过公证
  const macConfig = context.packager.config.mac || {};
  if (macConfig.identity === null || macConfig.identity === 'null') {
    console.log('⏭️  跳过公证（identity=null，本地测试模式）');
    return;
  }

  const issuerID = process.env.APP_STORE_CONNECT_ISSUER_ID;
  const keyID = process.env.APP_STORE_CONNECT_KEY_ID;
  const keyP8 = process.env.APP_STORE_CONNECT_API_KEY_P8;
  const keyPath = process.env.APP_STORE_CONNECT_API_KEY_PATH;

  if (!issuerID || !keyID || (!keyP8 && !keyPath)) {
    console.warn(
      '⚠️  缺少公证所需环境变量（APP_STORE_CONNECT_ISSUER_ID / APP_STORE_CONNECT_KEY_ID / APP_STORE_CONNECT_API_KEY_PATH），跳过公证。\n' +
      '   如需正式发布，请设置这些变量后重新打包。'
    );
    return;
  }

  const { notarize } = require('@electron/notarize');

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`🔏 开始公证: ${appPath}`);

  // notarytool 需要 .p8 文件路径（appleApiKey），不接受文件内容字符串
  const notarizeOptions = keyPath
    ? {
        tool: 'notarytool',
        appPath,
        appleApiKey: keyPath,
        appleApiKeyId: keyID,
        appleApiIssuer: issuerID,
      }
    : (() => {
        // 退路：把 p8 内容写到临时文件
        const fs = require('fs');
        const os = require('os');
        const tmp = path.join(os.tmpdir(), `AuthKey_${keyID}.p8`);
        fs.writeFileSync(tmp, keyP8, { mode: 0o600 });
        return {
          tool: 'notarytool',
          appPath,
          appleApiKey: tmp,
          appleApiKeyId: keyID,
          appleApiIssuer: issuerID,
        };
      })();

  await notarize(notarizeOptions);

  console.log('✅ 公证完成');
};
