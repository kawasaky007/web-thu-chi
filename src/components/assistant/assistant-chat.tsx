"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  LoaderCircle,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";

import { getAssistantMonthlySummaryAction } from "@/app/(app)/assistant/actions";
import {
  createTransactionAction,
  deleteTransactionAction,
} from "@/app/(app)/transactions/actions";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { parseAssistantCommand } from "@/lib/assistant/parser";
import { initialTransactionActionState } from "@/lib/transactions/action-state";
import type { CategoryOption } from "@/lib/transactions/data";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  transactionId?: string;
};

type SpeechRecognitionResultEvent = {
  results: {
    0?: { 0?: { transcript?: string } };
  };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const QUICK_PROMPTS = [
  "Mua cà phê 18k",
  "Hôm qua đi chợ 250k",
  "Tháng này chi bao nhiêu?",
];

export function AssistantChat({
  categories,
  currentUserId,
  profileName,
  onClose,
}: {
  categories: CategoryOption[];
  currentUserId: string;
  profileName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: `Chào ${profileName}! Bạn cứ nói tự nhiên. Mình có thể tự thêm giao dịch, đọc tổng quan tháng hoặc mở nhanh một tính năng.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [pending, startTransition] = useTransition();
  const messageCounter = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  const addMessage = useCallback((message: Omit<ChatMessage, "id">) => {
    messageCounter.current += 1;
    const id = `assistant-message-${messageCounter.current}`;
    setMessages((current) => [...current, { ...message, id }]);
    return id;
  }, []);

  const runCommand = useCallback((rawInput: string) => {
    const cleanInput = rawInput.trim();
    if (!cleanInput || pending) return;

    addMessage({ role: "user", text: cleanInput });
    setInput("");
    const command = parseAssistantCommand(cleanInput, categories);

    if (command.kind === "help" || command.kind === "clarification") {
      addMessage({ role: "assistant", text: command.message });
      return;
    }

    if (command.kind === "navigate") {
      addMessage({ role: "assistant", text: `Mình đang mở ${command.label} cho bạn.` });
      router.push(command.href);
      return;
    }

    startTransition(async () => {
      if (command.kind === "monthly_summary") {
        const result = await getAssistantMonthlySummaryAction();
        if (result.status === "error") {
          addMessage({ role: "assistant", text: result.message });
          return;
        }
        addMessage({
          role: "assistant",
          text: `Tháng này có ${result.count} giao dịch: thu ${formatMoney(result.income)}, chi ${formatMoney(result.expense)}, số dư ${formatSignedMoney(result.balance)}.`,
        });
        return;
      }

      const formData = new FormData();
      formData.set("amountExpression", String(command.amount));
      formData.set("categoryId", command.category.id);
      formData.set("userId", currentUserId);
      formData.set("transactionDate", command.transactionDate);
      formData.set("note", command.note);
      const result = await createTransactionAction(initialTransactionActionState, formData);

      if (result.status === "success") {
        addMessage({
          role: "assistant",
          text: `Đã thêm ${command.category.type === "income" ? "khoản thu" : "khoản chi"} ${formatMoney(command.amount)} vào “${command.category.name}” ngày ${formatShortDate(command.transactionDate)}.`,
          transactionId: result.transactionId,
        });
        router.refresh();
        return;
      }

      const fieldMessage = result.fieldErrors
        ? Object.values(result.fieldErrors).find(Boolean)
        : null;
      addMessage({
        role: "assistant",
        text: fieldMessage ?? result.message ?? "Mình chưa thể thêm giao dịch này. Bạn thử nói lại nhé.",
      });
    });
  }, [addMessage, categories, currentUserId, pending, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSpeechSupported(Boolean(getSpeechRecognitionConstructor()));
    }, 0);
    return () => {
      window.clearTimeout(timer);
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [messages, pending]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runCommand(input);
  };

  const startListening = () => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      addMessage({ role: "assistant", text: "Trình duyệt này chưa hỗ trợ nhập giọng nói. Bạn vẫn có thể nhập bằng bàn phím." });
      return;
    }

    recognitionRef.current?.stop();
    const recognition = new Recognition();
    recognition.lang = "vi-VN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      addMessage({ role: "assistant", text: "Mình chưa nghe rõ. Bạn thử lại hoặc nhập câu bằng bàn phím nhé." });
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? "";
      setListening(false);
      if (transcript) runCommand(transcript);
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const undoTransaction = (transactionId: string, messageId: string) => {
    if (pending) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("transactionId", transactionId);
      const result = await deleteTransactionAction(initialTransactionActionState, formData);
      if (result.status === "success") {
        setMessages((current) => current.map((message) =>
          message.id === messageId
            ? { ...message, text: "Đã hoàn tác giao dịch vừa tạo.", transactionId: undefined }
            : message,
        ));
        router.refresh();
      } else {
        addMessage({ role: "assistant", text: result.message ?? "Không thể hoàn tác giao dịch này." });
      }
    });
  };

  return (
    <Sheet
      className="md:max-w-md"
      closeLabel="Đóng trợ lý Thu Chi"
      description="Hiểu lệnh tiếng Việt và thao tác trực tiếp trên dữ liệu household của bạn."
      onClose={pending ? () => undefined : onClose}
      open
      title="Trợ lý Thu Chi"
    >
      <div className="overflow-hidden rounded-[1.6rem] border border-forest/10 bg-paper-raised/58">
        <div className="flex items-center gap-3 border-b border-forest/8 bg-forest px-4 py-3 text-paper">
          <span className="grid size-10 place-items-center rounded-2xl bg-yellow text-ink">
            <Sparkles aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold">Agent đang sẵn sàng</p>
            <p className="mt-0.5 text-xs font-semibold text-paper/58">Xử lý cục bộ · Không tốn phí AI</p>
          </div>
          <span className="size-2.5 rounded-full bg-mint shadow-[0_0_0_5px_rgba(111,224,183,0.14)]" />
        </div>

        <div className="max-h-[48dvh] min-h-72 space-y-3 overflow-y-auto p-3" aria-live="polite">
          {messages.map((message) => (
            <div className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`} key={message.id}>
              {message.role === "assistant" ? (
                <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-xl bg-mint-soft text-forest">
                  <Bot aria-hidden="true" className="size-4" />
                </span>
              ) : null}
              <div className={`max-w-[84%] rounded-2xl px-3.5 py-2.5 text-sm font-semibold leading-6 ${message.role === "user" ? "rounded-br-md bg-forest text-paper" : "rounded-bl-md border border-forest/8 bg-white/78 text-ink"}`}>
                <p>{message.text}</p>
                {message.transactionId ? (
                  <button
                    className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2 text-xs font-extrabold text-expense hover:bg-rose/20"
                    disabled={pending}
                    onClick={() => undoTransaction(message.transactionId!, message.id)}
                    type="button"
                  >
                    <RotateCcw aria-hidden="true" className="size-3.5" /> Hoàn tác
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {pending ? (
            <div className="flex items-center gap-2 text-xs font-bold text-forest/52">
              <span className="grid size-8 place-items-center rounded-xl bg-mint-soft text-forest"><Bot aria-hidden="true" className="size-4" /></span>
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Đang xử lý dữ liệu...
            </div>
          ) : null}
          <div ref={scrollAnchorRef} />
        </div>

        {messages.length === 1 ? (
          <div className="hide-scrollbar flex gap-2 overflow-x-auto border-t border-forest/8 px-3 py-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button className="min-h-9 shrink-0 rounded-xl bg-mist/70 px-3 text-xs font-extrabold text-forest hover:bg-mist" key={prompt} onClick={() => runCommand(prompt)} type="button">
                {prompt}
              </button>
            ))}
          </div>
        ) : null}

        <form className="flex items-end gap-2 border-t border-forest/8 bg-paper-raised p-3" onSubmit={handleSubmit}>
          <label className="min-w-0 flex-1">
            <span className="sr-only">Nhắn cho trợ lý Thu Chi</span>
            <input
              className="min-h-12 w-full rounded-2xl border border-forest/12 bg-paper px-4 py-3 text-base font-semibold text-ink outline-none placeholder:text-ink/34 focus:border-indigo/55 focus:ring-4 focus:ring-indigo/10"
              disabled={pending || listening}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  runCommand(input);
                }
              }}
              placeholder={listening ? "Đang nghe bạn nói..." : "Ví dụ: Mới mua cafe 18k"}
              type="text"
              value={input}
            />
          </label>
          <Button
            aria-label={listening ? "Đang nghe" : speechSupported ? "Nói với trợ lý" : "Giọng nói chưa được hỗ trợ"}
            className={listening ? "bg-expense text-white" : undefined}
            disabled={pending || listening || !speechSupported}
            onClick={startListening}
            size="icon"
            type="button"
            variant={listening ? "danger" : "secondary"}
          >
            {speechSupported ? <Mic aria-hidden="true" className="size-5" /> : <MicOff aria-hidden="true" className="size-5" />}
          </Button>
          <Button aria-label="Gửi lệnh" disabled={pending || listening || !input.trim()} size="icon" type="submit">
            {pending ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <Send aria-hidden="true" className="size-5" />}
          </Button>
        </form>
      </div>
      <p className="mt-3 text-center text-[11px] font-semibold leading-5 text-ink/38">
        Lệnh rõ ràng được thực hiện ngay. Nếu thiếu thông tin, agent sẽ hỏi lại trước khi thay đổi dữ liệu.
      </p>
    </Sheet>
  );
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Math.abs(value))} đ`;
}

function formatSignedMoney(value: number) {
  return `${value >= 0 ? "+" : "-"}${formatMoney(value)}`;
}

function formatShortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
