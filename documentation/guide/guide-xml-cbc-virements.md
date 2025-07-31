# Guide de Création de Fichiers XML pour Virements CBC

Ce guide vous aidera à créer un fichier XML au format pain.001.001.03 conforme aux standards ISO 20022 pour effectuer des virements via votre banque CBC en Belgique.

## 1. Introduction au Format XML pain.001

Le format **pain.001** (PAyment INitiation) est le standard européen ISO 20022 utilisé par CBC et toutes les banques belges pour les virements SEPA et internationaux. Ce format remplace les anciens formats propriétaires et permet d'automatiser les paiements par lots.

### Versions supportées par CBC :
- **pain.001.001.03** (recommandé)
- **pain.001.001.09** (nouvelle version 2019)

## 2. Structure du Fichier XML

Le fichier XML pain.001 est structuré en **3 niveaux hiérarchiques** :

### A. Niveau Message (GroupHeader)
- **Obligatoire et unique**
- Contient les informations générales du message
- Identifiant unique, date de création, nombre total de transactions

### B. Niveau Lot (PaymentInformation) 
- **Obligatoire et répétable**
- Informations sur le compte débiteur
- Type de paiement, date d'exécution
- Peut contenir plusieurs transactions

### C. Niveau Transaction (CreditTransferTransactionInformation)
- **Obligatoire et répétable**
- Détails de chaque virement individuel
- Bénéficiaire, montant, communication

## 3. Éléments Obligatoires

| Élément | Balise XML | Description | Exemple |
|---------|------------|-------------|---------|
| Message Identification | `<MsgId>` | Identifiant unique du message | CBC123456789_20250727_001 |
| Creation DateTime | `<CreDtTm>` | Date et heure de création | 2025-07-27T16:00:00 |
| Number of Transactions | `<NbOfTxs>` | Nombre total de transactions | 2 |
| Payment Method | `<PmtMtd>` | Méthode de paiement | TRF |
| Requested Execution Date | `<ReqdExctnDt>` | Date d'exécution souhaitée | 2025-07-28 |
| Debtor Name | `<Nm>` | Nom du débiteur | Ma Société SPRL |
| Debtor Account IBAN | `<IBAN>` | IBAN du compte débiteur | BE68539007547034 |
| Debtor Agent BIC | `<BIC>` | Code BIC de CBC | GKCCBEBB |
| End to End Id | `<EndToEndId>` | Référence de bout en bout | FACTURE_2025_001 |
| Instructed Amount | `<InstdAmt>` | Montant à virer | 750.25 |
| Creditor Name | `<Nm>` | Nom du bénéficiaire | Fournisseur ABC SA |
| Creditor Account IBAN | `<IBAN>` | IBAN du compte créancier | BE62510007547061 |

## 4. Codes Spécifiques

### Codes de Service Level (ServiceLevel)
- **SEPA** : Virement SEPA standard
- **PRPT** : Service prioritaire EBA

### Codes de Catégorie (CategoryPurpose)
- **SUPP** : Paiement fournisseur
- **SALA** : Paiement de salaire
- **INTC** : Paiement intra-entreprise
- **TREA** : Opération de trésorerie
- **TAXS** : Paiement de taxes

### Codes de Priorité (InstructionPriority)
- **NORM** : Priorité normale
- **HIGH** : Priorité élevée (traitement urgent)

### Répartition des Frais (ChargeBearer)
- **SLEV** : Selon le niveau de service
- **SHAR** : Partagé entre débiteur et créancier

## 5. Exemple de Fichier XML Complet

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" 
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <CstmrCdtTrfInitn>
        <!-- GROUPE HEADER (Niveau Message) -->
        <GrpHdr>
            <MsgId>CBC123456789_20250727_001</MsgId>
            <CreDtTm>2025-07-27T16:00:00</CreDtTm>
            <NbOfTxs>2</NbOfTxs>
            <CtrlSum>1250.50</CtrlSum>
            <InitgPty>
                <Nm>Ma Société SPRL</Nm>
                <Id>
                    <OrgId>
                        <Othr>
                            <Id>0123456789</Id>
                            <Issr>KBO-BCE</Issr>
                        </Othr>
                    </OrgId>
                </Id>
            </InitgPty>
        </GrpHdr>
        
        <!-- PAYMENT INFORMATION (Niveau Lot) -->
        <PmtInf>
            <PmtInfId>PMT_20250727_001</PmtInfId>
            <PmtMtd>TRF</PmtMtd>
            <BtchBookg>true</BtchBookg>
            <NbOfTxs>2</NbOfTxs>
            <CtrlSum>1250.50</CtrlSum>
            
            <PmtTpInf>
                <InstrPrty>NORM</InstrPrty>
                <SvcLvl>
                    <Cd>SEPA</Cd>
                </SvcLvl>
                <CtgyPurp>
                    <Cd>SUPP</Cd>
                </CtgyPurp>
            </PmtTpInf>
            
            <ReqdExctnDt>2025-07-28</ReqdExctnDt>
            
            <!-- Informations du débiteur -->
            <Dbtr>
                <Nm>Ma Société SPRL</Nm>
                <PstlAdr>
                    <Ctry>BE</Ctry>
                    <AdrLine>Rue de la Paix 123</AdrLine>
                    <AdrLine>5000 Namur</AdrLine>
                </PstlAdr>
                <Id>
                    <OrgId>
                        <Othr>
                            <Id>0123456789</Id>
                            <Issr>KBO-BCE</Issr>
                        </Othr>
                    </OrgId>
                </Id>
            </Dbtr>
            
            <DbtrAcct>
                <Id>
                    <IBAN>BE68539007547034</IBAN>
                </Id>
                <Ccy>EUR</Ccy>
            </DbtrAcct>
            
            <DbtrAgt>
                <FinInstnId>
                    <BIC>GKCCBEBB</BIC>
                </FinInstnId>
            </DbtrAgt>
            
            <ChrgBr>SLEV</ChrgBr>
            
            <!-- Transaction 1 -->
            <CdtTrfTxInf>
                <PmtId>
                    <InstrId>TXN001_20250727</InstrId>
                    <EndToEndId>FACTURE_2025_001</EndToEndId>
                </PmtId>
                
                <Amt>
                    <InstdAmt Ccy="EUR">750.25</InstdAmt>
                </Amt>
                
                <CdtrAgt>
                    <FinInstnId>
                        <BIC>KREDBEBB</BIC>
                    </FinInstnId>
                </CdtrAgt>
                
                <Cdtr>
                    <Nm>Fournisseur ABC SA</Nm>
                    <PstlAdr>
                        <Ctry>BE</Ctry>
                        <AdrLine>Avenue des Entreprises 456</AdrLine>
                        <AdrLine>1000 Bruxelles</AdrLine>
                    </PstlAdr>
                </Cdtr>
                
                <CdtrAcct>
                    <Id>
                        <IBAN>BE62510007547061</IBAN>
                    </Id>
                </CdtrAcct>
                
                <RmtInf>
                    <Ustrd>Paiement facture 2025/001 - Services janvier</Ustrd>
                </RmtInf>
            </CdtTrfTxInf>
            
            <!-- Transaction 2 avec communication structurée -->
            <CdtTrfTxInf>
                <PmtId>
                    <InstrId>TXN002_20250727</InstrId>
                    <EndToEndId>FACTURE_2025_002</EndToEndId>
                </PmtId>
                
                <Amt>
                    <InstdAmt Ccy="EUR">500.25</InstdAmt>
                </Amt>
                
                <CdtrAgt>
                    <FinInstnId>
                        <BIC>BBRUBEBB</BIC>
                    </FinInstnId>
                </CdtrAgt>
                
                <Cdtr>
                    <Nm>Consultant XYZ</Nm>
                </Cdtr>
                
                <CdtrAcct>
                    <Id>
                        <IBAN>BE43068999999501</IBAN>
                    </Id>
                </CdtrAcct>
                
                <!-- Communication structurée OGM -->
                <RmtInf>
                    <Strd>
                        <CdtrRefInf>
                            <Tp>
                                <CdOrPrtry>
                                    <Cd>SCOR</Cd>
                                </CdOrPrtry>
                            </Tp>
                            <Ref>+++123/4567/89012+++</Ref>
                        </CdtrRefInf>
                    </Strd>
                </RmtInf>
            </CdtTrfTxInf>
        </PmtInf>
    </CstmrCdtTrfInitn>
</Document>
```

## 6. Règles de Validation

### Caractères autorisés :
- Lettres : a-z, A-Z
- Chiffres : 0-9
- Caractères spéciaux : / - ? : ( ) . , ' + (espace)

### Contraintes importantes :
- **MessageId** : Maximum 35 caractères, doit être unique
- **IBAN** : Format belge BE + 14 chiffres
- **BIC CBC** : GKCCBEBB
- **Montants** : Maximum 999,999,999.99 EUR
- **Date d'exécution** : Maximum 1 an dans le futur
- **Nom bénéficiaire** : Maximum 70 caractères

## 7. Informations Spécifiques CBC

### Code BIC CBC : `GKCCBEBB`

### Upload dans CBC-Online for Business :
1. Connectez-vous à CBC-Online for Business
2. Allez dans "Paiements" > "Upload fichier"
3. Sélectionnez votre fichier XML
4. Vérifiez les détails
5. Signez et envoyez

### Horaires de traitement :
- **Cut-off standard** : 12h00 pour traitement le jour même
- **Cut-off CBC-Online for Business** : 16h00
- **Virements instantanés** : 24h/24, 7j/7 (jusqu'à 1M€)

## 8. Outils et Ressources

### Validation :
- Schéma XSD disponible sur : www.iso20022.org
- Validateur en ligne : plusieurs outils gratuits disponibles

### Documentation officielle :
- **Febelfin** : Standards belges pour ISO 20022
- **CBC** : Documentation technique sur CBC-Online for Business
- **EPC** : Rulebook SEPA Credit Transfer

### Support :
- **Helpdesk CBC Professionnels** : 081 80 18 99
- **Email** : Disponible via CBC-Online for Business

## 9. Conseils Pratiques

1. **Testez d'abord** avec un petit fichier de 1-2 transactions
2. **Sauvegardez** vos templates XML pour réutilisation
3. **Vérifiez** toujours les IBAN et BIC avant envoi
4. **Respectez** les cut-off times pour traitement rapide
5. **Utilisez** des identifiants uniques pour éviter les doublons

## 10. Dépannage

### Erreurs communes :
- **Caractères non autorisés** : Évitez les accents et caractères spéciaux
- **IBAN invalide** : Vérifiez le format et la clé de contrôle
- **BIC manquant** : Requis même pour virements SEPA en Belgique
- **Montant incorrect** : Format décimal avec point (750.25 pas 750,25)
- **Date invalide** : Format ISO : YYYY-MM-DD

### En cas de rejet :
1. Consultez le message d'erreur dans CBC-Online for Business
2. Corrigez le fichier selon l'erreur indiquée
3. Re-uploadez le fichier corrigé
4. Contactez le support CBC si nécessaire

---

*Ce guide est basé sur les standards ISO 20022 et les spécifications Febelfin pour la Belgique. Vérifiez toujours avec CBC pour les dernières mises à jour.*