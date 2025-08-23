# Chrome & Edge Extension Store Publishing Checklist

## ✅ Pre-Publishing Checklist

### 1. **Manifest.json Requirements**
- [x] Manifest version 3
- [x] Valid extension name (under 45 characters)
- [x] Clear, descriptive description
- [x] Version number follows semver
- [x] All required permissions justified
- [x] Host permissions limited to necessary domains
- [x] Icons in all required sizes (16, 48, 128)
- [x] Service worker properly configured

### 2. **Code Quality**
- [x] No console.log statements in production
- [x] Error handling implemented
- [x] Code follows best practices
- [x] No external dependencies (all code is local)
- [x] No eval() or innerHTML usage
- [x] Content Security Policy compliant

### 3. **Privacy & Security**
- [x] Privacy policy created (PRIVACY.md)
- [x] Minimal permissions requested
- [x] No data collection beyond necessary functionality
- [x] No external analytics or tracking
- [x] Clear data usage explanation
- [x] GDPR/CCPA compliant

### 4. **User Experience**
- [x] Clean, professional UI design
- [x] Responsive popup interface
- [x] Clear user instructions
- [x] Proper error messages
- [x] Loading states handled
- [x] Accessibility considerations

### 5. **Documentation**
- [x] README.md with installation instructions
- [x] Feature descriptions
- [x] Usage examples
- [x] Troubleshooting guide
- [x] License file (MIT)
- [x] Contact information

### 6. **Assets**
- [x] High-quality icons (16x16, 48x48, 128x128)
- [x] Screenshots for store listing
- [x] Promotional images (if required)
- [x] Icon transparency handled

### 7. **Testing**
- [x] Tested in Chrome 88+
- [x] Tested in Edge 88+
- [x] Tested on different screen sizes
- [x] Tested with different user scenarios
- [x] Error scenarios tested
- [x] Performance tested

## 📋 Store Listing Requirements

### Chrome Web Store
- [ ] Extension package (.crx or .zip)
- [ ] Store listing description
- [ ] Screenshots (1280x800 or 640x400)
- [ ] Promotional images
- [ ] Privacy policy URL
- [ ] Support URL
- [ ] Category selection
- [ ] Language selection

### Microsoft Edge Add-ons Store
- [ ] Extension package (.zip)
- [ ] Store listing description
- [ ] Screenshots (1280x800)
- [ ] Privacy policy URL
- [ ] Support URL
- [ ] Category selection
- [ ] Language selection

## 🔧 Technical Requirements

### Chrome Web Store
- [ ] Extension must work with Manifest V3
- [ ] No external code execution
- [ ] Clear permission justification
- [ ] No deceptive practices
- [ ] Follows Chrome Web Store policies

### Microsoft Edge Add-ons Store
- [ ] Extension must work with Manifest V3
- [ ] No external code execution
- [ ] Clear permission justification
- [ ] No deceptive practices
- [ ] Follows Microsoft Store policies

## 📝 Store Listing Content

### Description Template
```
Cursor Session Token Extractor

Automatically extract and copy your WorkosCursorSessionToken from Cursor.com dashboard for seamless IDE integration.

✨ Features:
• Automatic token detection when visiting Cursor dashboard
• One-click copy to clipboard
• Clean, minimalist interface
• Privacy-first approach - no data collection
• Works with all modern browsers

🔧 How it works:
1. Install the extension
2. Visit cursor.com/dashboard
3. Token is automatically detected and copied
4. Use the token in your IDE

🔒 Privacy & Security:
• Only accesses cursor.com domain
• No personal data collected
• All data stored locally
• No external tracking

Perfect for developers who need quick access to their Cursor session tokens for IDE integration.
```

### Keywords
- cursor
- session
- token
- extractor
- ide
- development
- clipboard
- automation

## 🚀 Publishing Steps

### Chrome Web Store
1. Create developer account
2. Upload extension package
3. Fill store listing information
4. Submit for review
5. Wait for approval (1-3 business days)

### Microsoft Edge Add-ons Store
1. Create developer account
2. Upload extension package
3. Fill store listing information
4. Submit for review
5. Wait for approval (1-5 business days)

## 📞 Support Information

### Contact Details
- **Email**: [your-email@domain.com]
- **GitHub**: [https://github.com/yourusername/cursor-session-extractor]
- **Support URL**: [https://github.com/yourusername/cursor-session-extractor/issues]

### Version History
- **v1.0.0**: Initial release with automatic token extraction

## ⚠️ Common Rejection Reasons

- Insufficient permission justification
- Poor user experience
- Missing privacy policy
- Deceptive functionality
- External code execution
- Poor code quality
- Incomplete documentation

## ✅ Final Checklist

Before submitting:
- [ ] All files included in package
- [ ] No development files included
- [ ] Icons are high quality
- [ ] Screenshots are clear and representative
- [ ] Description is compelling and accurate
- [ ] Privacy policy is accessible
- [ ] Support information is provided
- [ ] Extension works as described
