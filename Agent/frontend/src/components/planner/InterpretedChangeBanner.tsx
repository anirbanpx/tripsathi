
interface Props {
  message: string;
}

// Shown during refinement; dismisses automatically when plan updates.
export default function InterpretedChangeBanner({ message }: Props) {
  return (
    // TODO: replace with Claude Design output from design-reference/InterpretedChangeBanner.html
    <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
      <span className="text-blue-500 mt-0.5 text-base">↻</span>
      <div>
        <p className="text-sm font-medium text-blue-800">Making your change</p>
        <p className="text-sm text-blue-700">{message}</p>
      </div>
    </div>
  );
}
