// ─── 생성 로그 모달 ───
// 에러 토스트 클릭 또는 "GGAI: 로그 보기" 명령으로 열린다. 공용 LogView를 그대로 띄워
// 전체 생성 내역 + 라벨/결과 필터 + 요청/응답 본문을 보여준다(설정 탭과 동일한 화면).

import { App, Modal } from "obsidian";
import type GGAICorePlugin from "../main.ts";
import { makeT } from "./strings.ts";
import { LogView } from "./log-view.ts";

export class LogModal extends Modal {
  constructor(app: App, private plugin: GGAICorePlugin, private focusId?: string) {
    super(app);
  }

  onOpen(): void {
    const L = makeT(this.plugin.data.settings.uiLanguage ?? "ko");
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: L("log_modal_title") });
    new LogView(this.plugin, L, { focusId: this.focusId }).mount(contentEl);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
