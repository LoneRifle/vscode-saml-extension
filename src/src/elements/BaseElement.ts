const vscode        = require('vscode');
const xmlCrypto     = require('xml-crypto');
const xpath         = require('xpath');
const crypto        = require('crypto');
const SignedXml     = xmlCrypto.SignedXml;
const utils         = require('../utils');
const algorithms = {
  signature: {
    'rsa-sha256': 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    'rsa-sha1':  'http://www.w3.org/2000/09/xmldsig#rsa-sha1'
  },
  digest: {
    'sha256': 'http://www.w3.org/2001/04/xmlenc#sha256',
    'sha1': 'http://www.w3.org/2000/09/xmldsig#sha1'
  }
};

export default class BaseElement{
  _sig_alg: string;
  _digest_alg: string;
  _publicKey: string; 
  _signingKey: string;
  _transforms: string;
  _signaturePrefix: string;
  _xml: any;

  idAttribute: string;
  reference: string;
  signaturePath: string;
  
  constructor(xml) {
    var settings = vscode.workspace.getConfiguration("xmlSignature");
    this._sig_alg = settings.sig_alg;
    this._digest_alg = settings.digest_alg;
    this._publicKey = settings.publicKey; 
    this._signingKey = settings.signingKey;
    this._transforms = settings.transforms;
    this._signaturePrefix = settings.signaturePrefix;
    this._xml = xml;
    this.idAttribute = 'ID';
  }

  signXml(key) {
    utils.removeHeaders(this._publicKey);

    var sig = new SignedXml(null, {
      signatureAlgorithm: algorithms.signature[this._sig_alg],
      idAttribute: this.idAttribute
    });

    sig.addReference(this.reference, this._transforms, algorithms.digest[this._digest_alg]);
    sig.signingKey = key;
    sig.keyInfoProvider = {
      getKeyInfo: (key, prefix) => {
        prefix = prefix ? prefix + ':' : prefix;
        return `<${prefix}X509Data><${prefix}X509Certificate>${this._publicKey}</${prefix}X509Certificate></${prefix}X509Data>"`;
      }
    };
    sig.computeSignature(this._xml.toString(), {
      location: {
        reference: "//*[local-name(.)='Issuer']",
        action: 'after'
      },
      prefix: this._signaturePrefix || ''
    });

    return sig.getSignedXml();
  }

  validateSignature(public_key?: string) {
    try{
      var signature = xpath.select(this.signaturePath, this._xml)[0];
      if (!signature){
        return [];
      }

      var sig = new xmlCrypto.SignedXml(null, { idAttribute: this.idAttribute });
      sig.keyInfoProvider = {
        getKeyInfo: function() {
          return '<X509Data></X509Data>';
        },
        getKey: (keyInfo) => {
          // Use the cert passed by the command
          if (public_key){
            return  utils.certToPEM(public_key);
          }

          // Use embedded cert          
          if(keyInfo && keyInfo.length > 0){
            var embeddedSignature = keyInfo[0].getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "X509Certificate");
            if (embeddedSignature.length > 0) {
              var base64cer = embeddedSignature[0].firstChild.toString();
              return utils.certToPEM(base64cer);
            }  
          }

          // Use the one configured in settings
          return  utils.certToPEM(this._publicKey || '');
        }
      };

      sig.loadSignature(signature.toString());
      sig.checkSignature(this._xml.toString());
      
      return sig.validationErrors;
    } catch(e){
      return [`Error checking signature: ${e}`];
    }
  } 
}
