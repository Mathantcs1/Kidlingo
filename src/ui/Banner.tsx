export default function Banner({ supported }: { supported: boolean }) {
  if (supported) return null;
  return (
    <div className="banner" role="alert" data-testid="banner-no-webcodecs">
      Your browser can't edit video. Use Chrome or Safari 17 or later.
    </div>
  );
}
