// Hook köprüsü: pre-commit hook'u bu yerel sunucuya POST atar, quiz VS Code'da açılır,
// kullanıcı bitirince yanıt "tamam" (commit sürsün) ya da "iptal" olur.
// Sadece 127.0.0.1'de dinler; her repo için rastgele bir token .git/anladinmi-vscode.json'a yazılır.
import * as crypto from "crypto";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import { BAGLANTI_DOSYASI, gitKlasoru } from "./git";

export type HookSonucu = "tamam" | "iptal";

export class HookSunucusu {
  private sunucu: http.Server | undefined;
  private port = 0;
  private readonly tokenlar = new Map<string, string>(); // token -> repo kökü
  private readonly dosyalar = new Map<string, string>(); // repo kökü -> bağlantı dosyası
  private readonly atlanacak = new Map<string, NodeJS.Timeout>(); // eklentinin kendi attığı commit'ler

  constructor(private readonly quizIste: (kok: string) => Promise<HookSonucu>) {}

  baslat(): Promise<void> {
    return new Promise((coz, reddet) => {
      this.sunucu = http.createServer((req, res) => void this.isle(req, res));
      this.sunucu.on("error", reddet);
      this.sunucu.listen(0, "127.0.0.1", () => {
        this.port = (this.sunucu!.address() as { port: number }).port;
        coz();
      });
    });
  }

  /** Repoyu hook'a tanıt: port + token'ı .git içine yaz. */
  async repoKaydet(kok: string): Promise<void> {
    if (!this.port || this.dosyalar.has(kok)) return;
    const token = crypto.randomBytes(24).toString("hex");
    const dosya = path.join(await gitKlasoru(kok), BAGLANTI_DOSYASI);
    fs.writeFileSync(dosya, JSON.stringify({ port: this.port, token }, null, 2));
    this.tokenlar.set(token, kok);
    this.dosyalar.set(kok, dosya);
  }

  /** Eklenti commit'i kendisi atarken hook tekrar quiz açmasın. */
  birSonrakiniAtla(kok: string) {
    clearTimeout(this.atlanacak.get(kok));
    this.atlanacak.set(kok, setTimeout(() => this.atlanacak.delete(kok), 60_000));
  }

  kapat() {
    for (const [kok, dosya] of this.dosyalar) {
      try {
        // Başka bir VS Code penceresi üstüne yazdıysa onunkini silme.
        const icerik = JSON.parse(fs.readFileSync(dosya, "utf8")) as { port?: number };
        if (icerik.port === this.port) fs.unlinkSync(dosya);
      } catch {
        /* dosya zaten yok */
      }
      this.dosyalar.delete(kok);
    }
    this.sunucu?.close();
  }

  private async isle(req: http.IncomingMessage, res: http.ServerResponse) {
    const yanit = (kod: number, govde: string) => {
      res.writeHead(kod, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(govde);
    };
    if (req.method !== "POST" || req.url !== "/quiz") return yanit(404, "yok");
    const token = req.headers["x-anladinmi-token"];
    const kok = typeof token === "string" ? this.tokenlar.get(token) : undefined;
    if (!kok) return yanit(403, "tamam"); // tanımadığımız istek: commit'e karışma

    const atla = this.atlanacak.get(kok);
    if (atla) {
      clearTimeout(atla);
      this.atlanacak.delete(kok);
      return yanit(200, "tamam");
    }
    try {
      yanit(200, await this.quizIste(kok));
    } catch {
      yanit(200, "tamam"); // ne olursa olsun commit'i engelleme
    }
  }
}
