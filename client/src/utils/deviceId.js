import FingerprintJS from '@fingerprintjs/fingerprintjs'

const generateFingerprint = async () => {
  try {
    // Initialize an agent
    const fp = await FingerprintJS.load();

    // Get the visitor identifier
    const result = await fp.get();
    
    return result.visitorId;
  } catch (error) {
    console.error('Fingerprinting failed:', error);
    
    // Fallback to basic fingerprinting if the library fails
    const components = [
      navigator.userAgent,
      navigator.language,
      window.screen.colorDepth,
      `${window.screen.width},${window.screen.height}`,
      navigator.userAgentData?.platform || navigator.userAgent,
      new Date().getTimezoneOffset()
    ].filter(Boolean);
    
    return btoa(components.join('||')).substring(0, 32);
  }
};

const generateUserId = async () => {
  // Try to get existing ID from storage
  let userId = localStorage.getItem('user_id');
  
  if (!userId) {
    // Generate new fingerprint
    const fingerprint = await generateFingerprint();
    userId = `v1_${fingerprint}`;
    
    // Store it
    localStorage.setItem('user_id', userId);
  }
  
  return userId;
};

export { generateUserId }; 