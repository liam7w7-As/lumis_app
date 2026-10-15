import { useCallback, useMemo } from 'react';
import { PanResponder, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { hexToHsl, hslToHex } from '../lib/brandColors';

const SEGMENTS = 180;
const SEGMENT_ANGLE = 360 / SEGMENTS;
const LIGHTNESS = 0.5;

interface ColorWheelProps {
  color: string;
  size: number;
  onChange: (hex: string) => void;
}

/** Rueda de color (matiz por ángulo, saturación por distancia al centro). */
export function ColorWheel({ color, size, onChange }: ColorWheelProps) {
  const radius = size / 2;
  const center = radius;
  const thumbRadius = 13;

  const wedges = useMemo(() => {
    const paths: { d: string; fill: string }[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const a0 = ((i * SEGMENT_ANGLE - SEGMENT_ANGLE / 2) * Math.PI) / 180;
      const a1 = (((i + 1) * SEGMENT_ANGLE - SEGMENT_ANGLE / 2) * Math.PI) / 180;
      const x0 = center + radius * Math.cos(a0);
      const y0 = center + radius * Math.sin(a0);
      const x1 = center + radius * Math.cos(a1);
      const y1 = center + radius * Math.sin(a1);
      paths.push({
        d: `M ${center} ${center} L ${x0} ${y0} A ${radius} ${radius} 0 0 1 ${x1} ${y1} Z`,
        fill: hslToHex(i * SEGMENT_ANGLE, 1, LIGHTNESS),
      });
    }
    return paths;
  }, [center, radius]);

  const applyPoint = useCallback(
    (x: number, y: number) => {
      const c = size / 2;
      const dx = x - c;
      const dy = y - c;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const saturation = Math.min(distance / c, 1);
      let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (angle < 0) angle += 360;
      // ±SEGMENT_ANGLE/2: compensa el medio segmento para que cada matiz quede
      // centrado en su ángulo (el rojo, a la derecha).
      onChange(hslToHex(angle + SEGMENT_ANGLE / 2, saturation, LIGHTNESS));
    },
    [size, onChange],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          applyPoint(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        },
        onPanResponderMove: (evt) => {
          applyPoint(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        },
      }),
    [applyPoint],
  );

  const [hue, saturation] = hexToHsl(color);
  const thumbAngle = ((hue - SEGMENT_ANGLE / 2) * Math.PI) / 180;
  const thumbDistance = Math.max(0.12, Math.min(saturation, 1)) * radius;
  const thumbX = center + thumbDistance * Math.cos(thumbAngle);
  const thumbY = center + thumbDistance * Math.sin(thumbAngle);

  return (
    <View
      style={{ width: size, height: size }}
      {...panResponder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Selector de color"
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="wheel-saturation" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="1" />
            <Stop offset="0.75" stopColor="#ffffff" stopOpacity="0.15" />
            <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        {wedges.map((wedge, index) => (
          <Path key={index} d={wedge.d} fill={wedge.fill} />
        ))}
        <Circle cx={center} cy={center} r={radius} fill="url(#wheel-saturation)" />
        <Circle
          cx={thumbX}
          cy={thumbY}
          r={thumbRadius}
          fill={color}
          stroke="#ffffff"
          strokeWidth={3}
        />
      </Svg>
    </View>
  );
}
