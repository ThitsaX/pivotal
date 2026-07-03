// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import { FspiopErrors } from './fspiop-errors';

/**
 * Supported languages for user-facing FSPIOP error messages.
 */
export type ErrorMessageLanguage = 'en_US' | 'my';

/**
 * User-friendly, localized messages keyed by FSPIOP error code.
 *
 * These are the customer-facing strings returned in the web-outbound API response
 * (OutboundErrorInformation.message / .localeMessage). They are intentionally
 * separate from {@link FspiopErrors} descriptions, which carry the technical
 * FSPIOP protocol text used in the on-the-wire errorInformation object.
 */
export class FspiopUserMessages {

    static readonly DEFAULT_LANGUAGE: ErrorMessageLanguage = 'en_US';

    private static readonly MESSAGES: Readonly<Record<ErrorMessageLanguage, Readonly<Record<string, string>>>> = {
        en_US: {
            '1000': 'Payment is not successful. Please try again later.',
            '1001': 'Payment is not successful. Please try again later.',
            '2000': 'Please try again later. If you still cannot do the payment, please contact your service provider.',
            '2001': 'Please try again later. If you still cannot do the payment, please contact your service provider.',
            '2002': 'Please try again later. If you still cannot do the payment, please contact your service provider.',
            '2003': 'Service is currently unavailable. Please try again later.',
            '2004': 'Time Out. Please try again later.',
            '2005': 'Service is currently unavailable. Please try again later.',
            '3000': 'Please try again later. If you still cannot do the payment, please contact your service provider.',
            '3001': 'Please try again later. If you still cannot do the payment, please contact your service provider.',
            '3002': 'Please try again later. If you still cannot do the payment, please contact your service provider.',
            '3003': 'Please fill out the complete and correct information.',
            '3041': 'Service error. Please contact your service provider.',
            '3100': 'Please try again later. If you still cannot do the payment, please contact your service provider.',
            '3101': 'Please fill out the complete and correct information',
            '3102': 'Please fill out the complete and correct information.',
            '3103': 'Service is currently unavailable. Please try again later.',
            '3104': 'Payment is not successful. Please contact your service provider.',
            '3105': 'Payment is not successful. Please contact your service provider.',
            '3106': 'Payment is not successful.Please try again later.',
            '3107': 'Please fill out the complete and correct information.',
            '3200': 'Account does not exist.',
            '3201': 'Please try again later. If you still cannot make the payment, please contact your service provider.',
            '3202': 'Please try again later. If you still cannot make the payment, please contact your service provider.',
            '3203': 'Please try again later. If you still cannot make the payment, please contact your service provider.',
            '3204': 'Payment is not successful. Please contact your service provider.',
            '3205': 'Payment is not successful.Please try again later.',
            '3206': 'Payment is not successful.Please try again later.',
            '3207': 'Payment is not successful.Please try again later.',
            '3208': 'Payment is not successful.Please try again later.',
            '3209': 'Payment is not successful.Please try again later.',
            '3210': 'Payment is not successful.Please try again later.',
            '3241': 'Account does not match with phone number. Please contact MFI for updating your information.',
            '3242': 'Account is not active.',
            '3300': 'Time Out. Please try again later.',
            '3301': 'Time Out. Please try again later.',
            '3302': 'Time Out. Please try again later.',
            '3303': 'Time Out. Please try again later.',
            '4000': 'Please try again later. If you still cannot make the payment, please contact your service provider.',
            '4001': 'Your service provider is not available for this service now. Please contact your service provider.',
            '4100': 'Please contact your service provider.',
            '4101': 'Please contact your service provider.',
            '4102': 'Invalid Service Request. Please contact your service provider.',
            '4103': 'Invalid Service Request. Please contact your service provider.',
            '4200': 'Your service provider is not available for this service now. Please contact your service provider.',
            '4300': 'Please try again later. If you still cannot make the payment, please contact your service provider.',
            '4400': 'Please try again later. If you still cannot make the payment, please contact your service provider.',
            '5000': 'Please try again later. If you still cannot make the payment, please contact your service provider.',
            '5001': 'Your service provider is not available for this service now. Please contact your service provider.',
            '5100': 'Please contact your service provider.',
            '5101': 'Payment is not successful.',
            '5102': 'Payment Type is wrong. Please contact your service provider.',
            '5103': 'Payment is not successful.',
            '5104': 'Payment is not successful.',
            '5105': 'Payment is not successful.',
            '5106': 'Invalid Service Request. Please contact your service provider.',
            '5200': 'Payment is not successful. Your amount is either over or under the limit.',
            '5241': 'Amount is invalid. Please enter the format specified by the service provider.',
            '5300': 'Please try again later. If you still cannot make the payment, please contact your service provider.',
            '5400': 'Please try again later. If you still cannot make the payment, please contact your service provider.',
        },
        my: {
            '1000': 'ငွေပေးချေမှု မအောင်မြင်ပါ။ ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။',
            '1001': 'ငွေပေးချေမှု မအောင်မြင်ပါ။ ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။',
            '2000': 'ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။ ငွေပေးချေမှုပြုလုပ်၍ မရသေးပါက သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '2001': 'ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။ ငွေပေးချေမှုပြုလုပ်၍ မရသေးပါက သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '2002': 'ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။ ငွေပေးချေမှုပြုလုပ်၍ မရသေးပါက သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '2003': 'လတ်တလော ဝန်ဆောင်မှု မရရှိနိုင်ပါ။ ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။',
            '2004': 'အချိန်အကန့်အသတ် ကျော်လွန်သွားပါပြီ။ ကျေးဇူးပြု၍ နောက်တစ်ကြိမ်ထပ်မံကြိုးစားပါ။',
            '2005': 'လတ်တလော ဝန်ဆောင်မှု မရရှိနိုင်ပါ။ ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။',
            '3000': 'ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။ ငွေပေးချေမှုပြုလုပ်၍ မရသေးပါက သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '3001': 'ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။ ငွေပေးချေမှုပြုလုပ်၍ မရသေးပါက သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '3002': 'ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။ ငွေပေးချေမှုပြုလုပ်၍ မရသေးပါက သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '3003': 'ကျေးဇူးပြု၍ ပြည့်စုံမှန်ကန်သော  အချက်အလက်များကို ဖြည့်စွက်ပါ။',
            '3041': 'ဝန်ဆောင်မှု မရရှိနိုင်ပါ။ ကျေးဇူးပြု၍ သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '3100': 'ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။ ငွေပေးချေမှုပြုလုပ်၍ မရသေးပါက သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '3101': 'ကျေးဇူးပြု၍ ပြည့်စုံမှန်ကန်သော  အချက်အလက်များကို ဖြည့်စွက်ပါ။',
            '3102': 'ကျေးဇူးပြု၍ ပြည့်စုံမှန်ကန်သော  အချက်အလက်များကို ဖြည့်စွက်ပါ။',
            '3103': 'လတ်တလော ဝန်ဆောင်မှု မရရှိနိုင်ပါ။ ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။',
            '3104': 'ငွေပေးချေမှု မအောင်မြင်ပါ။ ကျေးဇူးပြု၍ သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ဆက်သွယ်ပါ။',
            '3105': 'ငွေပေးချေမှု မအောင်မြင်ပါ။ ကျေးဇူးပြု၍ သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ဆက်သွယ်ပါ။',
            '3106': 'ငွေပေးချေမှု မအောင်မြင်ပါ။ ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။',
            '3107': 'ကျေးဇူးပြု၍ ပြည့်စုံမှန်ကန်သော အချက်အလက်များကို ဖြည့်စွက်ပါ။',
            '3200': 'သင် ပေးချေလိုသော စာရင်း မရှိပါ။',
            '3201': 'ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။ ငွေပေးချေမှုပြုလုပ်၍ မရသေးပါက သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '3202': 'ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။ ငွေပေးချေမှုပြုလုပ်၍ မရသေးပါက သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '3203': 'ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။ ငွေပေးချေမှုပြုလုပ်၍ မရသေးပါက သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '3204': 'ငွေပေးချေမှု မအောင်မြင်ပါ။ ကျေးဇူးပြု၍ သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ဆက်သွယ်ပါ။',
            '3205': 'ငွေပေးချေမှု မအောင်မြင်ပါ။ ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။',
            '3206': 'ငွေပေးချေမှု မအောင်မြင်ပါ။ ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။',
            '3207': 'ငွေပေးချေမှု မအောင်မြင်ပါ။ ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။',
            '3208': 'ငွေပေးချေမှု မအောင်မြင်ပါ။ ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။',
            '3209': 'ငွေပေးချေမှု မအောင်မြင်ပါ။ ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။',
            '3210': 'ငွေပေးချေမှု မအောင်မြင်ပါ။ ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။',
            '3241': 'စာရင်းနှင့် ဖုန်းနံပါတ်မှာ ကိုက်ညီမှု မရှိပါ။ ကျေးဇူးပြု၍ သင်၏ အချက်အလက်များကို ပြင်ဆင်ပေးရန်အတွက် သက်ဆိုင်ရာအသေးစား ချေးငွေလုပ်ငန်းသို့ ဆက်သွယ်ပါ။',
            '3242': 'သင် ပေးချေလိုသော စာရင်းမှာ အသုံးမပြုနိုင်တော့ပါ။',
            '3300': 'အချိန်အကန့်အသတ် ကျော်လွန်သွားပါပြီ။ ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။',
            '3301': 'အချိန်အကန့်အသတ် ကျော်လွန်သွားပါပြီ။ ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။',
            '3302': 'အချိန်အကန့်အသတ် ကျော်လွန်သွားပါပြီ။ ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။',
            '3303': 'အချိန်အကန့်အသတ် ကျော်လွန်သွားပါပြီ။ ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။',
            '4000': 'ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။ ငွေပေးချေမှုပြုလုပ်၍ မရသေးပါက သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '4001': 'သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာန မှ ဤဝန်ဆောင်မှုအတွက် ယခုမရနိုင်သေးပါ။ ကျေးဇူးပြု၍ သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ဆက်သွယ်ပါ။',
            '4100': 'သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '4101': 'သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '4102': 'ဝန်ဆောင်မှု တောင်းဆိုချက် မမှန်ကန်ပါ။ သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '4103': 'ဝန်ဆောင်မှု တောင်းဆိုချက် မမှန်ကန်ပါ။ သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '4200': 'သက်ဆိုင်ရာ ၀န်ဆောင်မှုဌာနမှ ဤ၀န်ဆောင်မှုအတွက် ယခု မရနိုင်သေးပါ။ ကျေးဇူးပြု၍ သက်ဆိုင်ရာ ၀န်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '4300': 'ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။ ငွေပေးချေမှုပြုလုပ်၍ မရသေးပါက သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '4400': 'ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။ ငွေပေးချေမှုပြုလုပ်၍ မရသေးပါက သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '5000': 'ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။ ငွေပေးချေမှုပြုလုပ်၍ မရသေးပါက သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '5001': 'သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာန မှ ဤဝန်ဆောင်မှုအတွက် ယခုမရနိုင်သေးပါ။ ကျေးဇူးပြု၍ သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ဆက်သွယ်ပါ။',
            '5100': 'သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '5101': 'ငွေပေးချေမှု မအောင်မြင်ပါ။',
            '5102': 'ငွေပေးချေမှုပုံစံ မှားယွင်းနေပါသည်။ ကျေးဇူးပြု၍ သက်ဆိုင်ရာအသေးစား ချေးငွေလုပ်ငန်းသို့ ဆက်သွယ်ပါ။',
            '5103': 'ငွေပေးချေမှု မအောင်မြင်ပါ။',
            '5104': 'ငွေပေးချေမှု မအောင်မြင်ပါ။',
            '5105': 'ငွေပေးချေမှု မအောင်မြင်ပါ။',
            '5106': 'ဝန်ဆောင်မှု တောင်းဆိုချက် မမှန်ကန်ပါ။သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '5200': 'ငွေပေးချေမှု မအောင်မြင်ပါ။ သင် ပေးချေသော ငွေပမာဏမှာ အကန့်အသတ်ထက် ကျော်လွန်နေခြင်း သို့မဟုတ် လျော့နည်းနေခြင်း ဖြစ်သည်။',
            '5241': 'ထည့်သွင်းသော ငွေပမာဏ မမှန်ကန်ပါ။ ကျေးဇူးပြု၍ သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနမှ သတ်မှတ်ထားသော ပုံစံအတိုင်း ထည့်သွင်းပါ။',
            '5300': 'ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။ ငွေပေးချေမှုပြုလုပ်၍ မရသေးပါက သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
            '5400': 'ကျေးဇူးပြု၍ နောက်တစ်ကြိမ် ထပ်မံကြိုးစားပါ။ ငွေပေးချေမှုပြုလုပ်၍ မရသေးပါက သက်ဆိုင်ရာ ဝန်ဆောင်မှုဌာနသို့ ဆက်သွယ်ပါ။',
        },
    };

    /**
     * Resolves the user-friendly message for an FSPIOP error code in the requested
     * language, falling back to the default language and finally to the technical
     * FSPIOP description if no localized copy exists.
     */
    static messageFor(code: string, language: ErrorMessageLanguage = FspiopUserMessages.DEFAULT_LANGUAGE): string {
        const table = FspiopUserMessages.MESSAGES[language] ?? FspiopUserMessages.MESSAGES[FspiopUserMessages.DEFAULT_LANGUAGE];

        return table[code]
            ?? FspiopUserMessages.MESSAGES[FspiopUserMessages.DEFAULT_LANGUAGE][code]
            ?? FspiopErrors.find(code)?.description
            ?? FspiopErrors.GENERIC_SERVER_ERROR.description;
    }

    /**
     * Normalizes an arbitrary (e.g. environment-supplied) value into a supported
     * language, defaulting to {@link DEFAULT_LANGUAGE} when unset or unknown.
     */
    static resolveLanguage(value: string | undefined | null): ErrorMessageLanguage {
        const normalized = (value ?? '').trim();
        return FspiopUserMessages.isSupported(normalized)
            ? normalized
            : FspiopUserMessages.DEFAULT_LANGUAGE;
    }

    static isSupported(value: string): value is ErrorMessageLanguage {
        return value === 'en_US' || value === 'my';
    }
}
