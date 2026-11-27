// Demo reposundaki sepet.py için örnek çoktan seçmeli sorular.
// Hem eklentinin mock modu hem scripts/sahte-backend.js bunu kullanır (Claude'a gitmez).

export interface OrnekSoru {
  question: string;
  topic: string;
  line_hint: number | null;
  options: { id: string; text: string }[];
  correct_option: string;
  /** Doğru şık neden doğru. */
  explanation: string;
  /** Her yanlış şık aslında ne yapar / neden yanlış. */
  option_explanations: Record<string, string>;
}

const s = (texts: string[]) => texts.map((text, i) => ({ id: "ABCDE"[i], text }));

export const ORNEK_SORULAR: OrnekSoru[] = [
  {
    question: "`urun_ekle(\"elma\")` ve ardından `urun_ekle(\"ekmek\")` (ikisinde de `sepet` verilmeden) çağrılırsa ikinci çağrı ne döndürür?",
    topic: "fonksiyonlar",
    line_hint: 6,
    options: s([
      "`{\"ekmek\": 1}`",
      "`{\"elma\": 1, \"ekmek\": 1}`",
      "`{}`",
      "`TypeError` hatası verir",
      "`None`",
    ]),
    correct_option: "B",
    explanation:
      "`sepet={}` varsayılan değeri fonksiyon tanımlanırken **bir kez** oluşturulur ve sepet verilmeyen her çağrıda aynı sözlük kullanılır. İlk çağrının eklediği elma sözlükte kalır, ikinci çağrı ekmeği de ekler.",
    option_explanations: {
      A: "Her çağrıda yeni bir boş sözlük oluşsaydı böyle olurdu; Python'da varsayılan değerler her çağrıda yeniden oluşturulmaz.",
      C: "Fonksiyon sözlüğe ekleme yapıp aynı sözlüğü döndürüyor, boş kalamaz.",
      D: "`sepet.get(urun, 0) + adet` iki sayıyı toplar; burada tip hatası çıkacak bir işlem yok.",
      E: "Fonksiyonun son satırı `return sepet`; `None` sadece `return` olmasaydı dönerdi.",
    },
  },
  {
    question: "`ortalama_fiyat({})` (boş sepet) çağrılırsa ne olur?",
    topic: "uç durumlar",
    line_hint: 24,
    options: s([
      "`0` döndürür",
      "`None` döndürür",
      "`ZeroDivisionError` hatası verir",
      "`KeyError` hatası verir",
      "`nan` (sayı değil) döndürür",
    ]),
    correct_option: "C",
    explanation:
      "Boş sepette `sum(sepet.values())` 0 olur; `toplam(sepet) / toplam_adet` satırı 0'a böler ve Python `ZeroDivisionError` fırlatır. Bölmeden önce `if toplam_adet == 0: return 0` gibi bir kontrol gerekir.",
    option_explanations: {
      A: "Bunun için fonksiyonda boş sepet kontrolü olması gerekirdi; kod doğrudan bölüyor.",
      B: "Fonksiyon her durumda bir bölme sonucu döndürmeye çalışır, hiçbir yolda `None` dönmez.",
      D: "Hiçbir sözlüğe olmayan bir anahtarla erişilmiyor; `sum(sepet.values())` boş sözlükte sorunsuz 0 verir.",
      E: "`nan` bazı kütüphanelerde (ör. NumPy) çıkar; düz Python'da 0'a bölme hata fırlatır.",
    },
  },
  {
    question: "`toplam({\"elma\": 2, \"muz\": 3})` çağrılırsa (`muz` fiyat listesinde yok) ne olur?",
    topic: "girdi doğrulama",
    line_hint: 15,
    options: s([
      "`KeyError: 'muz'` hatası verir",
      "`25.0` döndürür; muz sessizce atlanır",
      "Muzun fiyatını 0 kabul edip bir uyarı yazdırır",
      "`None` döndürür",
      "`ValueError` hatası verir",
    ]),
    correct_option: "B",
    explanation:
      "`FIYATLAR.get(urun)` bilinmeyen ürün için `None` döner ve `continue` o ürünü **sessizce atlar**. Sonuç sadece 2 elma: 2 × 12.5 = 25.0. Kimse fark etmeden eksik toplam çıkar; bu yüzden bir uyarı ya da hata daha güvenli olurdu.",
    option_explanations: {
      A: "`FIYATLAR[urun]` yazılsaydı `KeyError` olurdu; `.get()` anahtar yoksa hata vermez, `None` döner.",
      C: "Kodda hiçbir `print` ya da uyarı yok; atlama tamamen sessiz.",
      D: "Fonksiyon en sonda her zaman `round(tutar, 2)` döndürür.",
      E: "Hiçbir satır `ValueError` fırlatmıyor; bilinmeyen ürün hata değil, atlama sebebi.",
    },
  },
  {
    question: "`toplam({\"sut\": 1}, indirim_kodu=\"ogrenci20\")` (küçük harfle) ne döndürür?",
    topic: "girdi doğrulama",
    line_hint: 19,
    options: s([
      "`25.6` (%20 indirimli)",
      "`32.0` (indirimsiz)",
      "`6.4` (sadece indirim tutarı)",
      "`TypeError` hatası verir",
      "`0`",
    ]),
    correct_option: "B",
    explanation:
      "Karşılaştırma `indirim_kodu == \"OGRENCI20\"` birebir yapılır, büyük/küçük harfe duyarlıdır. `\"ogrenci20\"` eşleşmez, indirim uygulanmaz ve sütün tam fiyatı 32.0 döner. `indirim_kodu.upper()` ile karşılaştırmak bunu çözer.",
    option_explanations: {
      A: "Kod `\"OGRENCI20\"` (büyük harf) yazılsaydı doğru olurdu; küçük harfli kod eşleşmiyor.",
      C: "Kod indirimi `tutar *= 0.8` ile uygular; indirim tutarını ayrıca döndüren bir yer yok.",
      D: "İki metni `==` ile karşılaştırmak her zaman çalışır, tip hatası çıkmaz.",
      E: "Eşleşmeyen kod tutarı sıfırlamaz; sadece indirim adımı atlanır.",
    },
  },
  {
    question: "`toplam()` sonucu neden `round(tutar, 2)` ile döndürülüyor?",
    topic: "sayılar",
    line_hint: 21,
    options: s([
      "Sonucu tam sayıya çevirmek için",
      "Ondalıklı sayı hatalarını (ör. `39.99999`) kuruş hassasiyetine yuvarlamak için",
      "Negatif tutarları sıfıra çekmek için",
      "Toplamı iki katına çıkarmak için",
      "Performansı artırmak için",
    ]),
    correct_option: "B",
    explanation:
      "Ondalıklı sayılar (`float`) bilgisayarda tam temsil edilemez; `0.8` ile çarpınca `39.99999` gibi sonuçlar çıkabilir. `round(..., 2)` sonucu iki basamağa, yani kuruşa yuvarlar.",
    option_explanations: {
      A: "Tam sayı için `round(tutar)` ya da `int(tutar)` gerekirdi; `2` iki ondalık basamak bırakır.",
      C: "`round` işareti değiştirmez; negatif sayı negatif kalır.",
      D: "`round`'un ikinci argümanı basamak sayısıdır, çarpan değil.",
      E: "Yuvarlama hızla ilgili değil, gösterilen sonucun doğruluğuyla ilgili.",
    },
  },
];
