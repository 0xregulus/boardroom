import type { DecisionStrategy } from "../types";

interface BoardroomFooterProps {
  selectedStrategy: DecisionStrategy | null;
}

export function BoardroomFooter({ selectedStrategy }: BoardroomFooterProps) {
  return (
    <footer className="boardroom-footer">
      <div className="footer-left">
        <span>Made with ❤️ by Facundo Rodriguez</span>
      </div>
      <div className="footer-right">
        <span>
          Context: <strong>{selectedStrategy?.name ?? "No Strategy Selected"}</strong>
        </span>
      </div>
    </footer>
  );
}
