// 0~23시를 "오전 9시"·"오후 3시"로
export const hourLabel = (hour: number) =>
  `${hour < 12 ? '오전' : '오후'} ${hour % 12 === 0 ? 12 : hour % 12}시`
