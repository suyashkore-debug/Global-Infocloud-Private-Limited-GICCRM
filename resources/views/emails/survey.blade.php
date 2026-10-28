<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; font-size: 14px; color: #334155; line-height: 1.6;">
    <h2 style="font-size: 19px; color: #0b2c56;">{{ $survey->subject }}</h2>
    @if ($survey->description)
        <div>{!! nl2br(e($survey->description)) !!}</div>
    @endif
    <p style="margin-top: 20px;">
        <a href="{{ $url }}" style="background: #0b2c56; color: #fff; padding: 11px 22px; border-radius: 8px; font-weight: bold; text-decoration: none;">Take the survey</a>
    </p>
    <p style="color: #888; font-size: 12px;">Or open this link: {{ $url }}</p>
</body>
</html>
